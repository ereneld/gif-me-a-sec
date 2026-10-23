// Turning a picked GIF, image or video into what the camera plays. Shared by
// the toolbar popup and the in-meeting quick panel.

const MAX_BYTES = 20 * 1024 * 1024;
// Video can't be decoded inside meeting pages reliably (CSP, codecs), so we
// capture it here as JPEG frames that the camera plays like a GIF.
const VIDEO_FPS = 10;
const VIDEO_MAX_SECONDS = 10;

export function bufferToBase64(buffer) {
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

// Saves an image file as the camera picture. Throws with a user-facing message.
export async function storeImage(buffer, meta) {
  if (buffer.byteLength > MAX_BYTES) throw new Error("that file is over 20 MB");
  const mime = sniffMime(buffer, meta.mime);
  if (!mime.startsWith("image/")) throw new Error("that doesn't look like an image");
  const gif = { title: meta.title, source: meta.source, url: meta.url || null, mime };
  await chrome.storage.local.set({ gif, gifData: bufferToBase64(buffer) });
  await chrome.storage.local.remove("gifFrames");
  return gif;
}

export async function storeRemoteImage(url, meta) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed, HTTP ${res.status}`);
  return storeImage(await res.arrayBuffer(), { ...meta, url, mime: res.headers.get("content-type") });
}

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

export async function storeRemoteVideo(url, meta, onProgress = () => {}) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed, HTTP ${res.status}`);
  const gifFrames = await captureVideoFrames(await res.blob(), onProgress);
  const gif = { title: meta.title, source: meta.source, url, mime: "image/jpeg", kind: "video" };
  await chrome.storage.local.set({ gif, gifFrames });
  await chrome.storage.local.remove("gifData");
  return gif;
}
