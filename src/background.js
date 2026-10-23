// Keyboard shortcuts: replay the GIF, toggle GifCam, or toggle the quick panel.
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "toggle-gifcam") {
    const { enabled } = await chrome.storage.local.get("enabled");
    await chrome.storage.local.set({ enabled: !enabled });
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
