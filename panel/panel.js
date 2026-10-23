// In-meeting quick panel: reaction shortcuts, search, and a 3-column grid.
// Lives in an extension iframe so meeting-page CSP can't block it.
import { PROVIDERS, thumbnail } from "../popup/providers.js";
import { storeRemoteImage, storeRemoteVideo } from "../popup/media.js";

const $ = (id) => document.getElementById(id);
const QUICK = [
  ["😮", "wow"],
  ["😂", "lol"],
  ["👏", "applause"],
  ["👍", "thumbs up"],
  ["👎", "nope"],
  ["👋", "bye"],
  ["🤔", "thinking"],
  ["☕", "brb"],
  ["🎉", "party"],
  ["🤯", "mind blown"],
  ["🙏", "thank you"],
  ["🔇", "you're on mute"],
];

let state = {};
let streams = 0;
let searchToken = 0;
let busy = false;

function tell(size) {
  window.parent.postMessage({ __gifcamPanel: true, type: "size", size }, "*");
}

function setOpen(open) {
  $("panel").classList.toggle("hidden", !open);
  $("launcher").classList.toggle("hidden", open);
  tell(open ? "open" : "closed");
  if (open) $("query").focus();
}

function status(text) {
  $("status").textContent = text;
}

function providersWithKeys() {
  return Object.keys(PROVIDERS).filter((p) => state[PROVIDERS[p].keyName]);
}

function renderProviders() {
  const select = $("provider");
  const usable = providersWithKeys();
  select.replaceChildren(...usable.map((p) => new Option(PROVIDERS[p].name, p)));
  select.classList.toggle("hidden", usable.length < 2);
  if (!usable.includes(state.panelProvider)) state.panelProvider = usable[0];
  if (state.panelProvider) select.value = state.panelProvider;
}

function renderChips(activeTerm) {
  $("chips").replaceChildren(
    ...QUICK.map(([emoji, term]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = `${emoji} ${term}`;
      b.classList.toggle("active", term === activeTerm);
      b.addEventListener("click", () => {
        $("query").value = term;
        search(term);
      });
      return b;
    })
  );
}

function emptyCell(text, action) {
  const div = document.createElement("div");
  div.className = "empty";
  div.append(text);
  if (action) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = action.label;
    b.addEventListener("click", action.run);
    div.append(" ", b);
  }
  return div;
}

async function search(term) {
  renderChips(term);
  const grid = $("grid");
  const providerId = state.panelProvider;
  if (!providerId) {
    grid.replaceChildren(
      emptyCell("Add a free GIPHY, Tenor or Pixabay API key to search.", {
        label: "Add a key",
        run: () => chrome.tabs.create({ url: chrome.runtime.getURL("popup/popup.html#welcome") }),
      })
    );
    return;
  }
  const provider = PROVIDERS[providerId];
  const token = ++searchToken;
  grid.replaceChildren(emptyCell("Loading…"));
  try {
    const items = await provider.search(term, state[provider.keyName], { type: state.pixabayType });
    if (token !== searchToken) return;
    if (!items.length) return grid.replaceChildren(emptyCell("No GIFs found."));
    grid.replaceChildren(...items.map(tile));
    grid.scrollTop = 0;
    status(provider.attribution);
  } catch (err) {
    if (token === searchToken) grid.replaceChildren(emptyCell(`Search failed: ${err.message}`));
  }
}

function tile(item) {
  const b = document.createElement("button");
  b.type = "button";
  b.title = item.title;
  b.append(thumbnail(item));
  if (item.kind === "video") {
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = item.seconds ? `▶ ${item.seconds}s` : "▶";
    b.append(badge);
  }
  b.addEventListener("click", () => pick(item, b));
  return b;
}

async function pick(item, button) {
  if (busy) return;
  busy = true;
  button.classList.add("busy");
  const bar = document.createElement("div");
  bar.className = "bar";
  button.append(bar);
  const meta = { title: item.title, source: state.panelProvider };
  try {
    status(item.kind === "video" ? "Converting video…" : "Loading GIF…");
    if (item.kind === "video") {
      await storeRemoteVideo(item.url, meta, (p) => (bar.style.width = `${Math.round(p * 100)}%`));
    } else {
      bar.style.width = "60%";
      await storeRemoteImage(item.url, meta);
    }
    // Picking from the panel means "show it now".
    await chrome.storage.local.set({ enabled: true });
    state.enabled = true;
    if (!streams) {
      status("It will play when your camera is on. (Reload this tab if Gif Me A Sec was just installed.)");
    } else if (state.mode === "still") {
      status("Showing a still frame.");
    } else {
      const then = { camera: "then your camera", freeze: "then freezing", loop: "on a loop" }[state.after || "camera"];
      status(`Playing for ${state.duration || 5}s, ${then}.`);
    }
  } catch (err) {
    status(`Couldn't use that one (${err.message}).`);
  } finally {
    busy = false;
    button.classList.remove("busy");
    bar.remove();
  }
}

window.addEventListener("message", (event) => {
  if (event.source !== window.parent || !event.data || !event.data.__gifcamPanel) return;
  if (event.data.type === "streams") streams = event.data.count;
  if (event.data.type === "open") setOpen(true);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  for (const [k, { newValue }] of Object.entries(changes)) state[k] = newValue;
  if (Object.keys(changes).some((k) => k.endsWith("Key"))) {
    renderProviders();
    search($("query").value.trim());
  }
});

(async () => {
  state = await chrome.storage.local.get([
    "giphyKey", "tenorKey", "pixabayKey", "pixabayType", "panelProvider",
    "enabled", "mode", "duration", "after",
  ]);
  renderProviders();
  renderChips();
  $("launcher").addEventListener("click", () => setOpen(true));
  $("collapse").addEventListener("click", () => setOpen(false));
  $("provider").addEventListener("change", (e) => {
    state.panelProvider = e.target.value;
    chrome.storage.local.set({ panelProvider: e.target.value });
    search($("query").value.trim());
  });
  $("searchForm").addEventListener("submit", (e) => {
    e.preventDefault();
    search($("query").value.trim());
  });
  document.addEventListener("keydown", (e) => e.key === "Escape" && setOpen(false));
  search("");
  tell("closed");
})();
