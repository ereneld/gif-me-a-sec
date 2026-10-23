// Page-world script: wraps camera tracks from getUserMedia so the selected GIF
// can play over the real camera for a few seconds. Settings arrive from bridge.js.
(() => {
  if (window.__gifcamInstalled) return;
  window.__gifcamInstalled = true;

  const TAG = "__gifcam__";
  const FPS = 30;
  const DEFAULTS = {
    enabled: true,
    mode: "animated", // "animated" | "still"
    duration: 5, // seconds the GIF animates before the "after" action
    after: "camera", // "camera" | "freeze" | "loop"
    fit: "contain", // "contain" | "cover"
    background: "blur", // "blur" | "black"
    gif: null,
  };

  const mediaDevices = navigator.mediaDevices;
  if (!mediaDevices || !mediaDevices.getUserMedia) return;

  const originalGetUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);

  let settings = { ...DEFAULTS };
  let frames = []; // [{ bitmap, duration }] duration in ms
  let totalDuration = 0;
  let decodeToken = 0;
  const sources = new Set();

  // ---------------------------------------------------------------- messaging

  function post(payload) {
    window.postMessage({ [TAG]: true, from: "page", ...payload }, "*");
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || !event.data[TAG]) return;
    const msg = event.data;
    if (msg.from !== "bridge") return;
    if (msg.type === "settings") applySettings(msg.settings, msg.gifBuffer, msg.frameSet);
    else if (msg.type === "replay") sources.forEach((s) => s.restart());
    else if (msg.type === "status") {
      post({
        type: "status",
        status: {
          enabled: settings.enabled,
          gifLoaded: frames.length > 0,
          frameCount: frames.length,
          activeStreams: sources.size,
        },
      });
    }
  });

  async function applySettings(next, gifBuffer, frameSet) {
    const cleaned = {};
    for (const key of Object.keys(DEFAULTS)) {
      cleaned[key] = next && next[key] !== undefined ? next[key] : DEFAULTS[key];
    }
    cleaned.duration = Math.max(0.5, Number(cleaned.duration) || DEFAULTS.duration);
    settings = cleaned;
    if (frameSet) await loadFrameSet(frameSet);
    else if (gifBuffer) await loadGif(gifBuffer, (settings.gif && settings.gif.mime) || "image/gif");
    else if (!settings.gif) setFrames([]);
    sources.forEach((s) => s.restart());
    notifyStreams();
  }

  post({ type: "hello" });

  // Lets the bridge show the quick panel while a camera is live and GifCam is on.
  function notifyStreams() {
    post({ type: "streams", count: settings.enabled ? sources.size : 0 });
  }

  // ----------------------------------------------------------------- decoding

  function setFrames(next) {
    frames.forEach((f) => f.bitmap.close && f.bitmap.close());
    frames = next;
    totalDuration = frames.reduce((sum, f) => sum + f.duration, 0);
  }

  async function loadGif(buffer, mime) {
    const token = ++decodeToken;
    let decoded;
    try {
      decoded = await decodeWithImageDecoder(buffer, mime);
    } catch (err) {
      console.warn("[GifCam] ImageDecoder failed, using first frame only:", err);
      const bitmap = await createImageBitmap(new Blob([buffer], { type: mime }));
      decoded = [{ bitmap, duration: 1000 }];
    }
    if (token !== decodeToken) {
      decoded.forEach((f) => f.bitmap.close());
      return;
    }
    setFrames(decoded);
  }

  async function loadFrameSet({ frameMs, buffers }) {
    const token = ++decodeToken;
    const decoded = await Promise.all(
      buffers.map(async (buf) => ({
        bitmap: await createImageBitmap(new Blob([buf], { type: "image/jpeg" })),
        duration: frameMs || 100,
      }))
    );
    if (token !== decodeToken) {
      decoded.forEach((f) => f.bitmap.close());
      return;
    }
    setFrames(decoded);
  }

  async function decodeWithImageDecoder(buffer, mime) {
    if (typeof ImageDecoder === "undefined") throw new Error("ImageDecoder unavailable");
    const decoder = new ImageDecoder({ data: buffer, type: mime });
    try {
      await decoder.tracks.ready;
      await decoder.completed;
      const count = decoder.tracks.selectedTrack.frameCount || 1;
      const out = [];
      for (let i = 0; i < count; i++) {
        const { image } = await decoder.decode({ frameIndex: i });
        // Cap frame size to keep memory reasonable for long GIFs.
        const scale = Math.min(1, 1280 / Math.max(image.displayWidth, image.displayHeight));
        const bitmap = await createImageBitmap(image, {
          resizeWidth: Math.max(1, Math.round(image.displayWidth * scale)),
          resizeHeight: Math.max(1, Math.round(image.displayHeight * scale)),
        });
        // VideoFrame duration is in microseconds; browsers treat ~0 delays as 100ms.
        let ms = (image.duration || 0) / 1000;
        if (ms < 20) ms = 100;
        image.close();
        out.push({ bitmap, duration: ms });
      }
      return out;
    } finally {
      decoder.close();
    }
  }

  // ------------------------------------------------------------------ ticking

  // Only the canvas fallback needs a clock; the main path is driven by camera frames.
  // Workers keep ticking in background tabs, where setInterval is throttled.
  // Some pages forbid blob: workers via CSP, so fall back to setInterval.
  let ticker = null;
  function ensureTicker() {
    if (ticker) return;
    const tick = () => {
      let live = 0;
      sources.forEach((s) => s.tick && (s.isEnded() ? s.dispose() : (s.tick(), live++)));
      if (!live) stopTicker();
    };
    try {
      const code = `setInterval(() => postMessage(0), ${Math.round(1000 / FPS)});`;
      const worker = new Worker(URL.createObjectURL(new Blob([code], { type: "text/javascript" })));
      worker.onmessage = tick;
      worker.onerror = () => {
        worker.terminate();
        const id = setInterval(tick, 1000 / FPS);
        ticker = { stop: () => clearInterval(id) };
      };
      ticker = { stop: () => worker.terminate() };
    } catch {
      const id = setInterval(tick, 1000 / FPS);
      ticker = { stop: () => clearInterval(id) };
    }
  }
  function stopTicker() {
    if (ticker) ticker.stop();
    ticker = null;
  }

  // ------------------------------------------------------------ camera filter

  const nativeEnabled = Object.getOwnPropertyDescriptor(MediaStreamTrack.prototype, "enabled");
  const canProcess =
    typeof MediaStreamTrackProcessor !== "undefined" &&
    typeof MediaStreamTrackGenerator !== "undefined" &&
    typeof VideoFrame !== "undefined";

  // Wraps one real camera track. Camera frames pass straight through, except
  // while a GIF is playing, when GIF frames are sent in their place.
  class CameraFilter {
    constructor(real) {
      this.real = real;
      this.lastFrame = null;
      this.canvas = null;
      this.ctx = null;
      this.width = 0;
      this.height = 0;
      if (canProcess) {
        this.output = new MediaStreamTrackGenerator({ kind: "video" });
        this.pump();
      } else {
        this.setupCanvasFallback();
      }
      this.disguise();
      this.restart();
    }

    // The page should see its own camera: same label, settings and controls.
    disguise() {
      const { real, output } = this;
      const own = (name, value) => Object.defineProperty(output, name, { value, configurable: true });
      own("label", real.label);
      own("getSettings", () => real.getSettings());
      own("getCapabilities", () => (real.getCapabilities ? real.getCapabilities() : {}));
      own("getConstraints", () => real.getConstraints());
      own("applyConstraints", (c) => real.applyConstraints(c));
      const stop = output.stop.bind(output);
      own("stop", () => {
        stop();
        real.stop();
        this.dispose();
      });
      Object.defineProperty(output, "enabled", {
        configurable: true,
        get: () => nativeEnabled.get.call(output),
        set: (v) => {
          nativeEnabled.set.call(output, v);
          real.enabled = v;
        },
      });
    }

    restart() {
      this.startedAt = performance.now();
      this.lastFrame = null;
    }

    isEnded() {
      return this.real.readyState === "ended";
    }

    // Which GIF frame to show right now, or null for the camera.
    gifFrame() {
      if (!settings.enabled || !frames.length) return null;
      const elapsed = performance.now() - this.startedAt;
      const playing = settings.after === "loop" || elapsed < settings.duration * 1000;
      if (playing) {
        this.lastFrame = settings.mode === "still" ? frames[0] : this.frameAt(elapsed);
        return this.lastFrame;
      }
      if (settings.after === "freeze") return this.lastFrame || this.frameAt(settings.duration * 1000);
      return null;
    }

    frameAt(elapsed) {
      if (frames.length === 1 || totalDuration <= 0) return frames[0];
      let t = elapsed % totalDuration;
      for (const f of frames) {
        if (t < f.duration) return f;
        t -= f.duration;
      }
      return frames[frames.length - 1];
    }

    ensureCanvas(width, height) {
      if (!this.canvas) {
        this.canvas =
          typeof OffscreenCanvas !== "undefined" && canProcess
            ? new OffscreenCanvas(width, height)
            : document.createElement("canvas");
        this.ctx = this.canvas.getContext("2d");
      }
      if (this.width !== width || this.height !== height) {
        this.canvas.width = this.width = width;
        this.canvas.height = this.height = height;
        this.backdrop = null;
      }
    }

    async pump() {
      const reader = new MediaStreamTrackProcessor({ track: this.real }).readable.getReader();
      const writer = this.output.writable.getWriter();
      try {
        for (;;) {
          const { value: frame, done } = await reader.read();
          if (done) break;
          const gif = this.gifFrame();
          if (!gif) {
            await writer.write(frame);
            continue;
          }
          this.ensureCanvas(frame.displayWidth, frame.displayHeight);
          this.paint(gif.bitmap, gif.bitmap.width, gif.bitmap.height);
          const out = new VideoFrame(this.canvas, { timestamp: frame.timestamp });
          frame.close();
          await writer.write(out);
        }
      } catch (err) {
        if (!this.isEnded()) console.warn("[GifCam] camera filter stopped:", err);
      } finally {
        this.output.stop();
        this.dispose();
      }
    }

    // Older browsers: draw the camera (or GIF) onto a canvas and capture it.
    setupCanvasFallback() {
      const s = this.real.getSettings();
      this.ensureCanvas(s.width || 1280, s.height || 720);
      this.video = document.createElement("video");
      this.video.muted = true;
      this.video.playsInline = true;
      this.video.srcObject = new MediaStream([this.real]);
      this.video.play().catch(() => {});
      this.output = this.canvas.captureStream(FPS).getVideoTracks()[0];
      this.tick = () => {
        const gif = this.gifFrame();
        if (gif) this.paint(gif.bitmap, gif.bitmap.width, gif.bitmap.height);
        else if (this.video.readyState >= 2) {
          this.ensureCanvas(this.video.videoWidth, this.video.videoHeight);
          this.ctx.drawImage(this.video, 0, 0, this.width, this.height);
        }
      };
      ensureTicker();
    }

    paint(source, sw, sh) {
      const { ctx, width: W, height: H } = this;
      if (!sw || !sh) return;
      const cover = Math.max(W / sw, H / sh);
      const contain = Math.min(W / sw, H / sh);
      const drawScaled = (scale) => {
        const w = sw * scale;
        const h = sh * scale;
        ctx.drawImage(source, (W - w) / 2, (H - h) / 2, w, h);
      };
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      if (settings.fit === "cover") {
        drawScaled(cover);
        return;
      }
      if (settings.background === "blur") ctx.drawImage(this.blurredBackdrop(source, sw, sh), 0, 0, W, H);
      drawScaled(contain);
    }

    // Blurring a full-size canvas every frame is too slow without a GPU, so blur
    // a small copy once per GIF frame and scale it up.
    blurredBackdrop(source, sw, sh) {
      if (this.backdrop && this.backdrop.source === source) return this.backdrop.canvas;
      const w = Math.max(16, Math.round(this.width / 8));
      const h = Math.max(9, Math.round(this.height / 8));
      const canvas = (this.backdrop && this.backdrop.canvas) || document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const c = canvas.getContext("2d");
      const scale = Math.max(w / sw, h / sh) * 1.1;
      c.filter = "blur(3px) brightness(0.7)";
      c.drawImage(source, (w - sw * scale) / 2, (h - sh * scale) / 2, sw * scale, sh * scale);
      this.backdrop = { source, canvas };
      return canvas;
    }

    dispose() {
      if (this.video) this.video.srcObject = null;
      if (sources.delete(this)) notifyStreams();
    }
  }

  // ---------------------------------------------------------------- override

  // Every camera track is wrapped (whether GifCam is on or not), so turning
  // GifCam on or off takes effect instantly without restarting the camera.
  async function getUserMedia(constraints) {
    const stream = await originalGetUserMedia(constraints);
    const videoTracks = stream.getVideoTracks();
    if (!videoTracks.length) return stream;
    try {
      const wrapped = videoTracks.map((real) => {
        const filter = new CameraFilter(real);
        sources.add(filter);
        return filter.output;
      });
      notifyStreams();
      return new MediaStream([...stream.getAudioTracks(), ...wrapped]);
    } catch (err) {
      console.warn("[GifCam] couldn't wrap the camera, using it directly:", err);
      return stream;
    }
  }

  // Keep the override looking native to sites that inspect it.
  Object.defineProperty(getUserMedia, "name", { value: "getUserMedia" });
  getUserMedia.toString = () => "function getUserMedia() { [native code] }";
  mediaDevices.getUserMedia = getUserMedia;
})();
