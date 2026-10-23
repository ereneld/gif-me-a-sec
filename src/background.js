// Keyboard shortcuts: replay the GIF in the active tab, or toggle GifCam.
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "toggle-gifcam") {
    const { enabled } = await chrome.storage.local.get("enabled");
    await chrome.storage.local.set({ enabled: !enabled });
    return;
  }
  if (command === "replay-gif") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) chrome.tabs.sendMessage(tab.id, { type: "gifcam:replay" }).catch(() => {});
  }
});
