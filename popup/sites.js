// Where Gif Me A Sec runs. Nothing is required at install: the user turns it
// on for all sites (the default) or for a list of meeting sites plus their own,
// and Chrome asks for that access. The background script registers the camera
// scripts on whatever is granted.

// Same pattern the content scripts used up to 1.0.2, so people who already
// granted it keep it when they update.
export const ALL_SITES = ["<all_urls>"];

export const MEETING_SITES = [
  { name: "Google Meet", origins: ["https://meet.google.com/*"] },
  { name: "Zoom", origins: ["https://*.zoom.us/*", "https://*.zoom.com/*"] },
  { name: "Microsoft Teams", origins: ["https://teams.microsoft.com/*", "https://teams.live.com/*", "https://teams.cloud.microsoft/*"] },
  { name: "Webex", origins: ["https://*.webex.com/*"] },
  { name: "Whereby", origins: ["https://whereby.com/*"] },
  { name: "Jitsi Meet", origins: ["https://meet.jit.si/*", "https://8x8.vc/*"] },
  { name: "Discord", origins: ["https://discord.com/*"] },
  { name: "Slack", origins: ["https://app.slack.com/*"] },
];

// "meet.example.com", "https://meet.example.com/room" or "*.example.com" -> origin pattern.
export function siteFromInput(text) {
  let host = text.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").split(/[/?#]/)[0];
  if (!/^(\*\.)?([a-z0-9-]+\.)+[a-z0-9-]+(:\d+)?$/.test(host) && !/^localhost(:\d+)?$/.test(host)) return null;
  const scheme = host.startsWith("localhost") ? "http" : "https";
  return { name: host, origins: [`${scheme}://${host}/*`] };
}

const has = (origins) => chrome.permissions.contains({ origins }).catch(() => false);

// What is allowed now: { all, granted: Set of site names }, for the given site list.
export async function currentAccess(sites) {
  const all = await has(ALL_SITES);
  const granted = new Set();
  for (const site of sites) if (await has(site.origins)) granted.add(site.name);
  return { all, granted };
}

// Must be called straight from a click, before any other await.
// choice: { all: boolean, sites: [{name, origins}] chosen }, known: every site shown.
export async function requestSites(choice, known = [], extraOrigins = []) {
  const origins = [...(choice.all ? ALL_SITES : choice.sites.flatMap((s) => s.origins)), ...extraOrigins];
  const granted = origins.length ? await chrome.permissions.request({ origins }) : true;
  if (!granted || choice.all) return granted;
  // Narrowing down: drop all-site access and any site that was unticked.
  const keep = new Set(choice.sites.map((s) => s.name));
  const drop = [...ALL_SITES, ...known.filter((s) => !keep.has(s.name)).flatMap((s) => s.origins)];
  for (const o of drop) await chrome.permissions.remove({ origins: [o] }).catch(() => {});
  return granted;
}
