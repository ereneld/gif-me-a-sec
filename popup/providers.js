// GIF providers. Each returns [{ id, title, thumb, url }] where url is the
// full-size GIF that gets downloaded and used as the camera.

export const PROVIDERS = {
  giphy: {
    name: "GIPHY",
    keyName: "giphyKey",
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
