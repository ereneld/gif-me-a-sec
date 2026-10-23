// Isolated-world content script: relays Gif Me A Sec settings and the selected GIF
// from extension storage to the page-world camera override (inject.js).
(() => {
  const TAG = "__gifcam__";
  const SETTINGS_KEYS = ["enabled", "mode", "duration", "after", "fit", "background", "gif"];
  const IS_TOP = window === window.top;

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
    if (event.data.from === "page" && event.data.type === "streams") {
      streamCount = event.data.count;
      updatePanel();
    }
  });

  // ---------------------------------------------------------- quick panel
  // An extension iframe in the corner of the meeting page. It shows up while a
  // GifCam camera is live (or when toggled with the keyboard shortcut).

  const PANEL_SIZES = { closed: [56, 56], open: [320, 440] };
  let panel = null;
  let panelReady = false;
  let streamCount = 0;
  let forced = false;
  let showPanel = true;
  chrome.storage.local.get("showPanel").then(({ showPanel: v }) => {
    showPanel = v !== false;
    updatePanel();
  });

  function updatePanel() {
    if (!IS_TOP) return;
    const want = forced || (showPanel && streamCount > 0);
    if (want && !panel) {
      panel = document.createElement("iframe");
      panel.src = chrome.runtime.getURL("panel/panel.html");
      panel.title = "Gif Me A Sec reactions";
      panel.allow = "";
      panel.setAttribute("allowtransparency", "true");
      Object.assign(panel.style, {
        position: "fixed",
        left: "16px",
        bottom: "96px",
        border: "0",
        background: "transparent",
        colorScheme: "normal",
        zIndex: "2147483647",
      });
      sizePanel("closed");
      panelReady = false;
      panel.addEventListener("load", () => {
        panelReady = true;
        sendToPanel({ type: "streams", count: streamCount });
      });
      (document.body || document.documentElement).append(panel);
    } else if (!want && panel) {
      panel.remove();
      panel = null;
    }
    sendToPanel({ type: "streams", count: streamCount });
  }

  function sizePanel(size) {
    const [w, h] = PANEL_SIZES[size] || PANEL_SIZES.closed;
    panel.style.width = `${w}px`;
    panel.style.height = `${h}px`;
  }

  function sendToPanel(msg) {
    if (panel && panelReady && panel.contentWindow) {
      panel.contentWindow.postMessage({ __gifcamPanel: true, ...msg }, new URL(panel.src).origin);
    }
  }

  window.addEventListener("message", (event) => {
    if (!panel || event.source !== panel.contentWindow || !event.data || !event.data.__gifcamPanel) return;
    if (event.data.type === "size") sizePanel(event.data.size);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const keys = Object.keys(changes);
    const gifChanged = keys.includes("gifData") || keys.includes("gifFrames");
    if (!gifChanged && !keys.some((k) => SETTINGS_KEYS.includes(k))) return;
    sendSettings(gifChanged);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.showPanel) {
      showPanel = changes.showPanel.newValue !== false;
      updatePanel();
    }
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === "gifcam:panel" && IS_TOP) {
      forced = !panel;
      updatePanel();
      if (forced) panel.addEventListener("load", () => sendToPanel({ type: "open" }), { once: true });
    }
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
