import { PROVIDERS } from "./providers.js";

const $ = (id) => document.getElementById(id);
const MAX_BYTES = 20 * 1024 * 1024;
const DEFAULTS = {
  enabled: false,
  mode: "animated",
  duration: 5,
  after: "freeze",
  fit: "contain",
  background: "blur",
  gif: null,
  giphyKey: "",
  tenorKey: "",
  pixabayKey: "",
  pixabayType: "video",
  tab: "giphy",
};

let state = { ...DEFAULTS };
const save = (patch) => {
  state = { ...state, ...patch };
  return chrome.storage.local.set(patch);
};

function toast(text, ms = 2500) {
  const el = $("toast");
  el.textContent = text;
  el.classList.remove("hidden");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.add("hidden"), ms);
}

// ------------------------------------------------------------------ settings

function renderSettings() {
  $("enabled").checked = !!state.enabled;
  document.querySelector(`input[name=mode][value=${state.mode}]`).checked = true;
  $("duration").value = state.duration;
  $("after").value = state.after;
  $("fit").value = state.fit;
  $("background").value = state.background;
  $("giphyKey").value = state.giphyKey || "";
  $("tenorKey").value = state.tenorKey || "";
  $("pixabayKey").value = state.pixabayKey || "";
  $("pixabayType").value = state.pixabayType;
  document.querySelectorAll(".animated-only").forEach((el) => el.classList.toggle("hidden", state.mode !== "animated"));
  document.querySelectorAll(".contain-only").forEach((el) => el.classList.toggle("hidden", state.fit !== "contain"));
  renderStatus();
}

function renderStatus(status) {
  let line;
  if (!state.enabled) line = "Off. Your normal camera is used.";
  else if (!state.gif) line = "On, but no GIF picked yet.";
  else if (status && status.activeStreams > 0) line = `Live in this tab (${status.activeStreams} stream${status.activeStreams > 1 ? "s" : ""}).`;
  else line = "On. Start or restart your camera in the meeting to use it.";
  $("statusLine").textContent = line;
}

async function renderPreview() {
  const { gifData, gifFrames, gif } = await chrome.storage.local.get(["gifData", "gifFrames", "gif"]);
  const preview = $("preview");
  preview.replaceChildren();
  clearInterval(renderPreview.timer);
  if ((gifData || gifFrames) && gif) {
    const img = document.createElement("img");
    img.alt = gif.title || "";
    if (gifFrames) {
      // Play captured video frames like a GIF.
      let i = 0;
      const show = () => (img.src = `data:image/jpeg;base64,${gifFrames.frames[i++ % gifFrames.frames.length]}`);
      show();
      renderPreview.timer = setInterval(show, gifFrames.frameMs);
    } else {
      img.src = `data:${gif.mime || "image/gif"};base64,${gifData}`;
    }
    preview.append(img);
    $("gifTitle").textContent = gif.title || "Selected GIF";
  } else {
    const span = document.createElement("span");
    span.textContent = "No GIF selected";
    preview.append(span);
    $("gifTitle").textContent = "Pick a GIF below";
  }
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function queryTabStatus() {
  try {
    const tab = await activeTab();
    if (!tab) return;
    const status = await chrome.tabs.sendMessage(tab.id, { type: "gifcam:status" });
    renderStatus(status);
  } catch {
    // No content script on this tab (e.g. chrome:// pages).
  }
}

function bindSettings() {
  $("enabled").addEventListener("change", (e) => save({ enabled: e.target.checked }).then(renderSettings));
  document.querySelectorAll("input[name=mode]").forEach((el) =>
    el.addEventListener("change", (e) => save({ mode: e.target.value }).then(renderSettings))
  );
  $("duration").addEventListener("change", (e) => {
    const v = Math.min(3600, Math.max(0.5, Number(e.target.value) || 5));
    save({ duration: v }).then(renderSettings);
  });
  for (const id of ["after", "fit", "background"]) {
    $(id).addEventListener("change", (e) => save({ [id]: e.target.value }).then(renderSettings));
  }
  $("pixabayType").addEventListener("change", (e) => save({ pixabayType: e.target.value }).then(() => runSearch()));
  for (const id of ["giphyKey", "tenorKey", "pixabayKey"]) {
    $(id).addEventListener("change", (e) => save({ [id]: e.target.value.trim() }).then(() => runSearch()));
  }
  $("replay").addEventListener("click", async () => {
    const tab = await activeTab();
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { type: "gifcam:replay" }).catch(() => {});
    toast("Replaying the GIF");
  });
}

// ------------------------------------------------------------- choosing GIFs

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function sniffMime(buffer, fallback) {
  const b = new Uint8Array(buffer.slice(0, 12));
  const ascii = String.fromCharCode(...b);
  if (ascii.startsWith("GIF8")) return "image/gif";
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") return "image/webp";
  if (b[0] === 0x89 && ascii.slice(1, 4) === "PNG") return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  return fallback || "image/gif";
}

async function useGif(buffer, meta) {
  if (buffer.byteLength > MAX_BYTES) {
    toast("That file is over 20 MB. Pick a smaller GIF.");
    return;
  }
  const mime = sniffMime(buffer, meta.mime);
  if (!mime.startsWith("image/")) {
    toast("That doesn't look like an image.");
    return;
  }
  const gif = { title: meta.title, source: meta.source, url: meta.url || null, mime };
  await chrome.storage.local.set({ gif, gifData: bufferToBase64(buffer) });
  await chrome.storage.local.remove("gifFrames");
  state.gif = gif;
  await renderPreview();
  renderSettings();
  toast(state.enabled ? "GIF selected" : "GIF selected. Turn GifCam on to use it.");
}

async function useRemoteGif(url, meta) {
  toast("Downloading GIF…", 10000);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await useGif(await res.arrayBuffer(), { ...meta, url, mime: res.headers.get("content-type") });
  } catch (err) {
    toast(`Couldn't download that GIF (${err.message}).`);
  }
}

// Video can't be decoded inside meeting pages reliably (CSP, codecs), so we
// capture it here as JPEG frames that the camera plays like a GIF.
const VIDEO_FPS = 10;
const VIDEO_MAX_SECONDS = 10;

async function captureVideoFrames(blob, onProgress) {
  const url = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  video.src = url;
  try {
    await new Promise((resolve, reject) => {
      video.onloadeddata = resolve;
      video.onerror = () => reject(new Error("this browser can't play that video"));
    });
    const seconds = Math.min(video.duration || VIDEO_MAX_SECONDS, VIDEO_MAX_SECONDS);
    const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    const count = Math.max(1, Math.floor(seconds * VIDEO_FPS));
    const frames = [];
    for (let i = 0; i < count; i++) {
      video.currentTime = i / VIDEO_FPS;
      await new Promise((resolve) => (video.onseeked = resolve));
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const jpeg = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
      frames.push(bufferToBase64(await jpeg.arrayBuffer()));
      onProgress((i + 1) / count);
    }
    return { frameMs: 1000 / VIDEO_FPS, frames };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function useRemoteVideo(url, meta) {
  const bar = $("progress");
  const fill = bar.firstElementChild;
  toast("Converting video… keep this popup open.", 60000);
  bar.classList.remove("hidden");
  fill.style.width = "0";
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const gifFrames = await captureVideoFrames(await res.blob(), (p) => (fill.style.width = `${Math.round(p * 100)}%`));
    const gif = { title: meta.title, source: meta.source, url, mime: "image/jpeg", kind: "video" };
    await chrome.storage.local.set({ gif, gifFrames });
    await chrome.storage.local.remove("gifData");
    state.gif = gif;
    await renderPreview();
    renderSettings();
    toast(state.enabled ? "Video selected" : "Video selected. Turn GifCam on to use it.");
  } catch (err) {
    toast(`Couldn't use that video (${err.message}).`);
  } finally {
    bar.classList.add("hidden");
  }
}

function showTab(tab) {
  state.tab = tab;
  chrome.storage.local.set({ tab });
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  const panel = PROVIDERS[tab] ? "search" : tab;
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("hidden", p.dataset.panel !== panel));
  if (PROVIDERS[tab]) runSearch();
}

let searchToken = 0;
async function runSearch() {
  const provider = PROVIDERS[state.tab];
  if (!provider) return;
  const token = ++searchToken;
  const results = $("results");
  const notice = $("keyNotice");
  const key = state[provider.keyName];
  $("attribution").textContent = provider.attribution;
  $("pixabayType").classList.toggle("hidden", state.tab !== "pixabay");

  if (!key) {
    results.replaceChildren();
    notice.textContent = `Add a ${provider.name} API key under "API keys" below to search ${provider.name}. You can still use the URL or Upload tabs without one.`;
    notice.classList.remove("hidden");
    document.querySelector(".keys").open = true;
    return;
  }
  notice.classList.add("hidden");
  results.replaceChildren(emptyCell("Loading…"));

  try {
    const items = await provider.search($("query").value.trim(), key, { type: state.pixabayType });
    if (token !== searchToken) return;
    if (!items.length) {
      results.replaceChildren(emptyCell("No GIFs found."));
      return;
    }
    results.replaceChildren(
      ...items.map((item) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.title = item.title;
        const img = document.createElement("img");
        img.src = item.thumb;
        img.alt = item.title;
        img.loading = "lazy";
        btn.append(img);
        if (item.kind === "video") {
          const badge = document.createElement("span");
          badge.className = "badge";
          badge.textContent = item.seconds ? `▶ ${item.seconds}s` : "▶";
          btn.append(badge);
        }
        const meta = { title: item.title, source: state.tab };
        btn.addEventListener("click", () =>
          item.kind === "video" ? useRemoteVideo(item.url, meta) : useRemoteGif(item.url, meta)
        );
        return btn;
      })
    );
  } catch (err) {
    if (token !== searchToken) return;
    results.replaceChildren(emptyCell(`Search failed: ${err.message}. Check your API key.`));
  }
}

function emptyCell(text) {
  const div = document.createElement("div");
  div.className = "empty";
  div.textContent = text;
  return div;
}

function bindPicker() {
  document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
  $("searchForm").addEventListener("submit", (e) => {
    e.preventDefault();
    runSearch();
  });
  $("urlForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const url = $("gifUrl").value.trim();
    const title = decodeURIComponent(url.split("/").pop().split("?")[0] || "GIF from link");
    // Arbitrary hosts need permission to download; ask while we still have the click.
    chrome.permissions
      .request({ origins: [`${new URL(url).origin}/*`] })
      .then((granted) => {
        if (granted) useRemoteGif(url, { title, source: "url" });
        else toast("GifCam needs access to that site to download the GIF.");
      })
      .catch(() => useRemoteGif(url, { title, source: "url" }));
  });
  $("file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await useGif(await file.arrayBuffer(), { title: file.name, source: "upload", mime: file.type });
    e.target.value = "";
  });
}

// ---------------------------------------------------------------------- init

(async () => {
  state = { ...DEFAULTS, ...(await chrome.storage.local.get(Object.keys(DEFAULTS))) };
  bindSettings();
  bindPicker();
  renderSettings();
  renderPreview();
  showTab(state.tab);
  queryTabStatus();
})();
