// Page-world script: replaces camera streams from getUserMedia with a canvas
// stream that plays the selected GIF. Settings arrive from bridge.js.
(() => {
  if (window.__gifcamInstalled) return;
  window.__gifcamInstalled = true;

  const TAG = "__gifcam__";
  const VIRTUAL_ID = "gifcam-virtual-camera";
  const VIRTUAL_LABEL = "GifCam (virtual camera)";
  const FPS = 30;
  // Open the real camera this early so the switch from GIF to camera is instant.
  const CAMERA_WARMUP_MS = 2000;
  const DEFAULTS = {
    enabled: false,
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
  const originalEnumerateDevices = mediaDevices.enumerateDevices.bind(mediaDevices);

  let settings = { ...DEFAULTS };
  let frames = []; // [{ bitmap, duration }] duration in ms
  let totalDuration = 0;
  let decodeToken = 0;
  const sources = new Set();

  let resolveFirstSettings;
  const firstSettings = new Promise((resolve) => (resolveFirstSettings = resolve));

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
    resolveFirstSettings();
    sources.forEach((s) => s.restart());
  }

  post({ type: "hello" });

  // Lets the bridge show the quick panel while a GifCam camera is live.
  function notifyStreams() {
    post({ type: "streams", count: sources.size });
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

  // Workers keep ticking in background tabs, where setInterval is throttled.
  // Some pages forbid blob: workers via CSP, so fall back to setInterval.
  let ticker = null;
  function ensureTicker() {
    if (ticker) return;
    const tick = () => {
      sources.forEach((s) => (s.isEnded() ? s.dispose() : s.draw()));
      if (sources.size === 0) stopTicker();
    };
    try {
      const code = `setInterval(() => postMessage(0), ${Math.round(1000 / FPS)});`;
      const worker = new Worker(URL.createObjectURL(new Blob([code], { type: "text/javascript" })));
      worker.onmessage = tick;
      worker.onerror = () => {
        worker.terminate();
        ticker = { stop: () => clearInterval(id) };
        const id = setInterval(tick, 1000 / FPS);
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

  // ------------------------------------------------------------ stream source

  function pickDimension(value, fallback) {
    if (typeof value === "number") return value;
    if (value && typeof value === "object") {
      return value.exact || value.ideal || value.max || value.min || fallback;
    }
    return fallback;
  }

  function stripVirtualDevice(videoConstraints) {
    if (typeof videoConstraints !== "object") return videoConstraints;
    const copy = { ...videoConstraints };
    const id = copy.deviceId;
    const wanted = id && typeof id === "object" ? id.exact || id.ideal : id;
    if (wanted === VIRTUAL_ID || (Array.isArray(wanted) && wanted.includes(VIRTUAL_ID))) {
      delete copy.deviceId;
    }
    return Object.keys(copy).length ? copy : true;
  }

  class GifSource {
    constructor(videoConstraints) {
      const vc = typeof videoConstraints === "object" ? videoConstraints : {};
      this.width = Math.round(pickDimension(vc.width, 1280));
      this.height = Math.round(pickDimension(vc.height, 720));
      this.cameraConstraints = stripVirtualDevice(videoConstraints);
      this.pickedVirtual = wantsVirtual(videoConstraints);
      this.canvas = document.createElement("canvas");
      this.canvas.width = this.width;
      this.canvas.height = this.height;
      this.ctx = this.canvas.getContext("2d");
      this.stream = this.canvas.captureStream(FPS);
      this.track = this.stream.getVideoTracks()[0];
      this.camera = null; // { stream, video } while the real camera is shown
      this.cameraPending = false;
      this.lastFrame = null;
      this.disguiseTrack();
      this.restart();
    }

    disguiseTrack() {
      const track = this.track;
      const { width, height } = this;
      const getSettings = track.getSettings.bind(track);
      track.getSettings = () => ({
        ...getSettings(),
        deviceId: VIRTUAL_ID,
        groupId: VIRTUAL_ID,
        width,
        height,
        frameRate: FPS,
      });
      try {
        Object.defineProperty(track, "label", { value: VIRTUAL_LABEL });
      } catch {}
      const stop = track.stop.bind(track);
      track.stop = () => {
        stop();
        this.dispose();
      };
    }

    restart() {
      this.startedAt = performance.now();
      this.lastFrame = null;
      this.stopCamera();
      this.draw();
    }

    isEnded() {
      return this.track.readyState === "ended";
    }

    phase(elapsed) {
      // Turning GifCam off mid-call hands the stream back to the real camera.
      if (!settings.enabled && !this.pickedVirtual) return "camera";
      if (!frames.length && settings.after === "camera" && !this.pickedVirtual) return "camera";
      if (settings.mode === "still") return "still";
      if (settings.after === "loop" || elapsed < settings.duration * 1000) return "gif";
      return settings.after === "camera" ? "camera" : "freeze";
    }

    wantsCamera(elapsed) {
      if (this.phase(elapsed) === "camera") return true;
      return (
        settings.enabled &&
        settings.mode === "animated" &&
        settings.after === "camera" &&
        elapsed >= settings.duration * 1000 - CAMERA_WARMUP_MS
      );
    }

    frameAt(elapsed) {
      if (!frames.length) return null;
      if (frames.length === 1 || totalDuration <= 0) return frames[0];
      let t = elapsed % totalDuration;
      for (const f of frames) {
        if (t < f.duration) return f;
        t -= f.duration;
      }
      return frames[frames.length - 1];
    }

    draw() {
      const elapsed = performance.now() - this.startedAt;
      const phase = this.phase(elapsed);

      if (this.wantsCamera(elapsed)) this.startCamera();
      else this.stopCamera();

      if (phase === "camera") {
        const video = this.camera && this.camera.video;
        if (video && video.readyState >= 2) {
          this.paint(video, video.videoWidth, video.videoHeight);
          return;
        }
      }

      let frame;
      if (phase === "still") frame = frames[0];
      else if (phase === "gif") frame = this.frameAt(elapsed);
      else frame = this.lastFrame || this.frameAt(settings.duration * 1000);

      if (frame) {
        if (phase === "gif") this.lastFrame = frame;
        this.paint(frame.bitmap, frame.bitmap.width, frame.bitmap.height);
      } else {
        this.paintPlaceholder();
      }
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
      if (settings.fit === "cover" || source instanceof HTMLVideoElement) {
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

    paintPlaceholder() {
      const { ctx, width: W, height: H } = this;
      ctx.fillStyle = "#1f1b2e";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#c4b5fd";
      ctx.font = `bold ${Math.round(H / 12)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("GifCam: pick a GIF in the extension", W / 2, H / 2);
    }

    async startCamera() {
      if (this.camera || this.cameraPending) return;
      this.cameraPending = true;
      try {
        const stream = await originalGetUserMedia({ video: this.cameraConstraints });
        if (this.isEnded() || !this.wantsCamera(performance.now() - this.startedAt)) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        await video.play().catch(() => {});
        this.camera = { stream, video };
      } catch (err) {
        console.warn("[GifCam] Could not open the real camera:", err);
        settings = { ...settings, after: "freeze" };
      } finally {
        this.cameraPending = false;
      }
    }

    stopCamera() {
      if (!this.camera) return;
      this.camera.stream.getTracks().forEach((t) => t.stop());
      this.camera.video.srcObject = null;
      this.camera = null;
    }

    dispose() {
      this.stopCamera();
      if (sources.delete(this)) notifyStreams();
    }
  }

  // ---------------------------------------------------------------- overrides

  function wantsVirtual(videoConstraints) {
    if (!videoConstraints || typeof videoConstraints !== "object") return false;
    const id = videoConstraints.deviceId;
    const wanted = id && typeof id === "object" ? id.exact || id.ideal : id;
    return wanted === VIRTUAL_ID || (Array.isArray(wanted) && wanted.includes(VIRTUAL_ID));
  }

  async function shouldUseGif(constraints) {
    if (!constraints || !constraints.video) return false;
    await Promise.race([firstSettings, new Promise((r) => setTimeout(r, 1500))]);
    return settings.enabled || wantsVirtual(constraints.video);
  }

  async function getUserMedia(constraints) {
    if (!(await shouldUseGif(constraints))) return originalGetUserMedia(constraints);

    const source = new GifSource(constraints.video);
    sources.add(source);
    notifyStreams();
    ensureTicker();

    const tracks = [source.track];
    if (constraints.audio) {
      try {
        const audio = await originalGetUserMedia({ audio: constraints.audio });
        tracks.push(...audio.getAudioTracks());
      } catch (err) {
        source.track.stop();
        throw err;
      }
    }
    return new MediaStream(tracks);
  }

  async function enumerateDevices() {
    const devices = await originalEnumerateDevices();
    await Promise.race([firstSettings, new Promise((r) => setTimeout(r, 500))]);
    if (!settings.enabled) return devices;
    const virtual = {
      deviceId: VIRTUAL_ID,
      groupId: VIRTUAL_ID,
      kind: "videoinput",
      label: VIRTUAL_LABEL,
      getCapabilities() {
        return { deviceId: VIRTUAL_ID, groupId: VIRTUAL_ID, width: { min: 1, max: 1920 }, height: { min: 1, max: 1080 } };
      },
      toJSON() {
        return { deviceId: this.deviceId, groupId: this.groupId, kind: this.kind, label: this.label };
      },
    };
    if (typeof InputDeviceInfo !== "undefined") Object.setPrototypeOf(virtual, InputDeviceInfo.prototype);
    return [virtual, ...devices];
  }

  // Keep the overrides looking native to sites that inspect them.
  const nativeLike = (fn, name) => {
    Object.defineProperty(fn, "name", { value: name });
    fn.toString = () => `function ${name}() { [native code] }`;
    return fn;
  };
  mediaDevices.getUserMedia = nativeLike(getUserMedia, "getUserMedia");
  mediaDevices.enumerateDevices = nativeLike(enumerateDevices, "enumerateDevices");
})();
