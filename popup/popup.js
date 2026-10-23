import { PROVIDERS, thumbnail } from "./providers.js";
import { storeImage, storeRemoteImage, storeRemoteVideo } from "./media.js";

const $ = (id) => document.getElementById(id);
const DEFAULTS = {
  enabled: true,
  mode: "animated",
  duration: 5,
  after: "camera",
  fit: "contain",
  background: "blur",
  gif: null,
  giphyKey: "",
  tenorKey: "",
  pixabayKey: "",
  pixabayType: "video",
  showPanel: true,
  tab: "giphy",
  welcomeDone: false,
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
  $("pixabayType").value = state.pixabayType;
  $("showPanel").checked = state.showPanel !== false;
  document.querySelectorAll(".animated-only").forEach((el) => el.classList.toggle("hidden", state.mode !== "animated"));
  document.querySelectorAll(".contain-only").forEach((el) => el.classList.toggle("hidden", state.fit !== "contain"));
  renderStatus();
}

function renderStatus(status) {
  let line;
  if (!state.enabled) line = "Off. Your camera shows as normal.";
  else if (!state.gif) line = "On. Pick a GIF to play on your camera.";
  else if (status && status.activeStreams > 0) line = "Playing on your camera in this tab.";
  else line = "On. It plays when your camera starts, or when you pick a GIF.";
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
    span.textContent = "None";
    preview.append(span);
    $("gifTitle").textContent = "Pick a GIF above";
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

function showView(name) {
  for (const view of ["welcome", "main", "settings"]) $(`${view}View`).classList.toggle("hidden", view !== name);
  if (name === "settings") renderSettingsKeys();
  if (name === "welcome") renderWelcome();
  if (name === "main") runSearch();
}

function showSettings(open) {
  showView(open ? "settings" : "main");
}

// ------------------------------------------------------------------ API keys

const hasAnyKey = () => Object.values(PROVIDERS).some((p) => state[p.keyName]);

// A card with a provider's key input and a link to get a key.
function keyCard(id, onSaved) {
  const provider = PROVIDERS[id];
  const card = document.createElement("form");
  card.className = "key-card";
  const head = document.createElement("div");
  head.className = "key-head";
  const name = document.createElement("span");
  name.textContent = provider.name;
  const ok = document.createElement("span");
  ok.className = "ok";
  ok.textContent = state[provider.keyName] ? "✓ Added" : "";
  head.append(name, ok);
  const help = document.createElement("p");
  help.textContent = `${provider.keyHelp} `;
  const link = document.createElement("a");
  link.href = provider.keyUrl;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = "Get a free key ↗";
  help.append(link);
  const row = document.createElement("div");
  row.className = "key-row";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = `${provider.name} API key`;
  input.autocomplete = "off";
  input.spellcheck = false;
  input.value = state[provider.keyName] || "";
  const button = document.createElement("button");
  button.type = "submit";
  button.textContent = "Save";
  row.append(input, button);
  card.append(head, help, row);
  card.addEventListener("submit", async (e) => {
    e.preventDefault();
    const value = input.value.trim();
    await save({ [provider.keyName]: value });
    ok.textContent = value ? "✓ Added" : "";
    toast(value ? `${provider.name} key saved` : `${provider.name} key removed`);
    if (onSaved) onSaved(value);
  });
  return card;
}

function renderSettingsKeys() {
  $("settingsKeys").replaceChildren(...Object.keys(PROVIDERS).map((id) => keyCard(id)));
}

function renderWelcome() {
  const update = () => ($("welcomeDone").disabled = !hasAnyKey());
  $("welcomeKeys").replaceChildren(...Object.keys(PROVIDERS).map((id) => keyCard(id, update)));
  update();
}

async function finishWelcome() {
  await save({ welcomeDone: true });
  const firstWithKey = Object.keys(PROVIDERS).find((id) => state[PROVIDERS[id].keyName]);
  if (firstWithKey) showTab(firstWithKey);
  showView("main");
}

function bindSettings() {
  $("openSettings").addEventListener("click", () => showSettings($("settingsView").classList.contains("hidden")));
  $("closeSettings").addEventListener("click", () => showSettings(false));
  $("shortcutsLink").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
  });
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
  $("showPanel").addEventListener("change", (e) => save({ showPanel: e.target.checked }));
  $("pixabayType").addEventListener("change", (e) => save({ pixabayType: e.target.value }).then(() => runSearch()));
  $("replay").addEventListener("click", async () => {
    const tab = await activeTab();
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { type: "gifcam:replay" }).catch(() => {});
    toast("Replaying the GIF");
  });
}

// ------------------------------------------------------------- choosing GIFs

async function afterPick(gif, noun) {
  state.gif = gif;
  await renderPreview();
  renderSettings();
  toast(state.enabled ? `${noun} selected, playing on your camera` : `${noun} selected. Turn it on to use it.`);
}

async function useGif(buffer, meta) {
  try {
    await afterPick(await storeImage(buffer, meta), "GIF");
  } catch (err) {
    toast(`Couldn't use that file (${err.message}).`);
  }
}

async function useRemoteGif(url, meta) {
  toast("Downloading GIF…", 10000);
  try {
    await afterPick(await storeRemoteImage(url, meta), "GIF");
  } catch (err) {
    toast(`Couldn't use that GIF (${err.message}).`);
  }
}

async function useRemoteVideo(url, meta) {
  const bar = $("progress");
  const fill = bar.firstElementChild;
  toast("Converting video… keep this popup open.", 60000);
  bar.classList.remove("hidden");
  fill.style.width = "0";
  try {
    const gif = await storeRemoteVideo(url, meta, (p) => (fill.style.width = `${Math.round(p * 100)}%`));
    await afterPick(gif, "Video");
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

  $("searchForm").classList.toggle("hidden", !key);
  if (!key) {
    // No key for this tab yet: ask for it right here.
    results.replaceChildren();
    notice.replaceChildren(keyCard(state.tab, (value) => value && runSearch()));
    notice.classList.remove("hidden");
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
        btn.append(thumbnail(item));
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
        else toast("Gif Me A Sec needs access to that site to download the GIF.");
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
  // Opened as a full tab (welcome page after install, or options page).
  if (location.hash || window.innerWidth > 500) document.documentElement.classList.add("in-tab");
  bindSettings();
  bindPicker();
  $("welcomeDone").addEventListener("click", finishWelcome);
  $("welcomeSkip").addEventListener("click", finishWelcome);
  renderSettings();
  renderPreview();
  showTab(state.tab);
  if (location.hash === "#settings") showView("settings");
  else if (location.hash === "#welcome" || (!state.welcomeDone && !hasAnyKey())) showView("welcome");
  queryTabStatus();
})();
