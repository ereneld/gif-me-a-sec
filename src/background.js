// Keyboard shortcuts: replay the GIF, toggle GifCam, or toggle the quick panel.
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "toggle-gifcam") {
    const { enabled } = await chrome.storage.local.get("enabled");
    await chrome.storage.local.set({ enabled: enabled === false });
    return;
  }
  if (command === "toggle-panel") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) chrome.tabs.sendMessage(tab.id, { type: "gifcam:panel" }, { frameId: 0 }).catch(() => {});
    return;
  }
  if (command === "replay-gif") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) chrome.tabs.sendMessage(tab.id, { type: "gifcam:replay" }).catch(() => {});
  }
});

// ------------------------------------------------------------ site access
// No site access is required at install. The user grants "all sites" or a list
// of meeting sites from the welcome screen, and the camera scripts are
// registered here on whatever has been granted.

const PROVIDER_HOST = /^\w+:\/\/([^/]*\.)?(giphy\.com|pixabay\.com)\//;
const SCRIPT_IDS = ["gifcam-inject", "gifcam-bridge"];

async function siteOrigins() {
  const { origins = [] } = await chrome.permissions.getAll();
  const all = origins.includes("<all_urls>") || (origins.includes("https://*/*") && origins.includes("http://*/*"));
  if (all) return ["<all_urls>"];
  return origins.filter((o) => !PROVIDER_HOST.test(o));
}

async function syncScripts() {
  const matches = await siteOrigins();
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: SCRIPT_IDS }).catch(() => []);
  if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: existing.map((s) => s.id) });
  if (!matches.length) return matches;
  const common = { matches, runAt: "document_start", allFrames: true, persistAcrossSessions: true };
  await chrome.scripting.registerContentScripts([
    { id: "gifcam-inject", js: ["src/inject.js"], world: "MAIN", ...common },
    { id: "gifcam-bridge", js: ["src/bridge.js"], ...common },
  ]);
  return matches;
}

let syncing = Promise.resolve();
const resync = () => (syncing = syncing.then(syncScripts, syncScripts));

chrome.permissions.onAdded.addListener(resync);
chrome.permissions.onRemoved.addListener(resync);
chrome.runtime.onStartup.addListener(resync);

// First install: open the welcome page where people add their API keys and
// choose where the extension runs.
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === "update") chrome.storage.local.remove("tenorKey"); // Tenor was removed in 1.0.2.
  const matches = await resync();
  if (reason === "install") chrome.tabs.create({ url: chrome.runtime.getURL("popup/popup.html#welcome") });
  // Updating from a version that ran everywhere without asking: if Chrome didn't
  // carry that access over, ask again so meetings keep working.
  else if (reason === "update" && !matches.length) chrome.tabs.create({ url: chrome.runtime.getURL("popup/popup.html#sites") });
});
