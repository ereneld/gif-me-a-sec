// GIF providers. Each returns [{ id, title, thumb, url }] where url is the
// full-size GIF that gets downloaded and used as the camera.

export const PROVIDERS = {
  giphy: {
    name: "GIPHY",
    keyName: "giphyKey",
    keyUrl: "https://developers.giphy.com/dashboard/",
    keyHelp: "Create a free app in the GIPHY developer dashboard and copy its API key.",
    attribution: "Powered by GIPHY",
    async search(query, key) {
      const endpoint = query ? "search" : "trending";
      const params = new URLSearchParams({ api_key: key, limit: "24", rating: "pg-13" });
      if (query) params.set("q", query);
      const res = await fetch(`https://api.giphy.com/v1/gifs/${endpoint}?${params}`);
      if (!res.ok) throw new Error(`GIPHY returned ${res.status}`);
      const body = await res.json();
      return (body.data || []).map((g) => ({
        id: g.id,
        title: g.title || "GIPHY GIF",
        thumb: (g.images.fixed_width_small || g.images.fixed_width || g.images.original).url,
        url: (g.images.downsized_medium || g.images.original).url,
      }));
    },
  },
  tenor: {
    name: "Tenor",
    keyName: "tenorKey",
    keyUrl: "https://developers.google.com/tenor/guides/quickstart",
    keyHelp: "Enable the Tenor API in a Google Cloud project and create an API key.",
    attribution: "Powered by Tenor",
    async search(query, key) {
      const endpoint = query ? "search" : "featured";
      const params = new URLSearchParams({
        key,
        client_key: "gifcam",
        limit: "24",
        contentfilter: "medium",
        media_filter: "gif,mediumgif,tinygif",
      });
      if (query) params.set("q", query);
      const res = await fetch(`https://tenor.googleapis.com/v2/${endpoint}?${params}`);
      if (!res.ok) throw new Error(`Tenor returned ${res.status}`);
      const body = await res.json();
      return (body.results || []).map((g) => {
        const m = g.media_formats || {};
        return {
          id: g.id,
          title: g.content_description || "Tenor GIF",
          thumb: (m.tinygif || m.gif).url,
          url: (m.mediumgif || m.gif).url,
        };
      });
    },
  },
};

// Pixabay asks API users to cache responses for 24 hours.
const PIXABAY_CACHE_MS = 24 * 60 * 60 * 1000;

async function cachedJson(url) {
  const { pixabayCache = {} } = await chrome.storage.local.get("pixabayCache");
  const now = Date.now();
  for (const k of Object.keys(pixabayCache)) if (now - pixabayCache[k].t > PIXABAY_CACHE_MS) delete pixabayCache[k];
  const cacheKey = url.replace(/key=[^&]*&?/, "");
  if (pixabayCache[cacheKey]) return pixabayCache[cacheKey].body;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Pixabay returned ${res.status}`);
  const body = await res.json();
  pixabayCache[cacheKey] = { t: now, body };
  await chrome.storage.local.set({ pixabayCache });
  return body;
}

PROVIDERS.pixabay = {
  name: "Pixabay",
  keyName: "pixabayKey",
  keyUrl: "https://pixabay.com/api/docs/",
  keyHelp: "Sign up for free, then copy the key shown in the API docs.",
  attribution: "Images and videos from Pixabay",
  // options.type is "video" or "image".
  async search(query, key, options = {}) {
    const isVideo = options.type !== "image";
    const params = new URLSearchParams({ key, per_page: "24", safesearch: "true" });
    if (query) params.set("q", query.slice(0, 100));
    const base = isVideo ? "https://pixabay.com/api/videos/" : "https://pixabay.com/api/";
    const body = await cachedJson(`${base}?${params}`);
    return (body.hits || []).map((h) => {
      const title = h.tags || "Pixabay";
      if (isVideo) {
        const v = h.videos.tiny && h.videos.tiny.url ? h.videos.tiny : h.videos.small;
        return { id: h.id, title, thumb: v.thumbnail, preview: v.url, url: v.url, kind: "video", seconds: h.duration };
      }
      return { id: h.id, title, thumb: h.previewURL, url: h.webformatURL, kind: "image" };
    });
  },
};

// Grid thumbnail: an <img> (GIFs animate on their own), or for videos a muted
// looping <video> that only loads and plays while it's on screen.
const visibility =
  typeof IntersectionObserver !== "undefined" &&
  new IntersectionObserver((entries) => {
    for (const { target, isIntersecting } of entries) {
      if (isIntersecting) {
        if (!target.src) target.src = target.dataset.src;
        target.play().catch(() => {});
      } else {
        target.pause();
      }
    }
  });

export function thumbnail(item) {
  if (item.preview && visibility) {
    const video = document.createElement("video");
    video.dataset.src = item.preview;
    video.poster = item.thumb;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "none";
    video.setAttribute("aria-label", item.title);
    visibility.observe(video);
    return video;
  }
  const img = document.createElement("img");
  img.src = item.thumb;
  img.alt = item.title;
  img.loading = "lazy";
  return img;
}
