// Isolated-world content script: relays GifCam settings and the selected GIF
// from extension storage to the page-world camera override (inject.js).
(() => {
  const TAG = "__gifcam__";
  const SETTINGS_KEYS = ["enabled", "mode", "duration", "after", "fit", "background", "gif"];

  function base64ToBuffer(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  function post(payload, transfer) {
    window.postMessage({ [TAG]: true, from: "bridge", ...payload }, "*", transfer || []);
  }

  async function sendSettings(includeGif) {
    const data = await chrome.storage.local.get([...SETTINGS_KEYS, "gifData", "gifFrames"]);
    const settings = {};
    for (const k of SETTINGS_KEYS) settings[k] = data[k];
    let gifBuffer = null;
    let frameSet = null;
    if (includeGif && data.gifData) gifBuffer = base64ToBuffer(data.gifData);
    // Videos (e.g. from Pixabay) are stored as pre-captured JPEG frames.
    if (includeGif && data.gifFrames) {
      frameSet = { frameMs: data.gifFrames.frameMs, buffers: data.gifFrames.frames.map(base64ToBuffer) };
    }
    const transfer = [gifBuffer, ...(frameSet ? frameSet.buffers : [])].filter(Boolean);
    post({ type: "settings", settings, gifBuffer, frameSet }, transfer);
  }

  // The page script asks for settings when it loads (it may load after us).
  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || !event.data[TAG]) return;
    if (event.data.from === "page" && event.data.type === "hello") sendSettings(true);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const keys = Object.keys(changes);
    const gifChanged = keys.includes("gifData") || keys.includes("gifFrames");
    if (!gifChanged && !keys.some((k) => SETTINGS_KEYS.includes(k))) return;
    sendSettings(gifChanged);
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === "gifcam:replay") post({ type: "replay" });
    if (msg && msg.type === "gifcam:status") {
      const onReply = (event) => {
        if (event.source !== window || !event.data || !event.data[TAG]) return;
        if (event.data.from !== "page" || event.data.type !== "status") return;
        window.removeEventListener("message", onReply);
        sendResponse(event.data.status);
      };
      window.addEventListener("message", onReply);
      post({ type: "status" });
      setTimeout(() => window.removeEventListener("message", onReply), 1000);
      return true;
    }
  });

  sendSettings(true);
})();
