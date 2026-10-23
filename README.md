# Gif Me A Sec

Reaction GIFs on your webcam. Gif Me A Sec is a Chrome extension that plays a GIF on your camera for a few seconds in Google Meet, Zoom (web), Microsoft Teams (web), Whereby, Discord and any other site that uses your webcam, then goes straight back to you.

- **Your own camera, with GIFs on top**: there's no extra "virtual camera" to pick. Gif Me A Sec filters your real camera, playing the GIF for a set time (5 seconds by default) and then going straight back to you. You can also make it freeze on the last frame or keep looping, or show a still frame instead.
- **On by default, instant on/off**: turning it off or on applies right away in an ongoing call, with no camera restart or reload.
- **Pick GIFs** from GIPHY, Tenor or Pixabay (videos and images) with your own free API keys, a direct link, or an uploaded file (GIF, WebP, PNG, JPEG). Pixabay videos are converted to a 10-second, 10 fps clip in the popup.
- **Quick panel in meetings**: while your camera is on, a small GIF button sits in the corner of the meeting page. It opens reaction shortcuts (wow, lol, applause, bye…), a search box and a scrollable 3-column grid. One click plays that GIF, then hands back to your camera.
- **Simple popup**: the popup is just search and pick. Play time, what happens after, fit and API keys live under Settings (the gear).
- **Private**: no accounts, no tracking, no servers. See [PRIVACY.md](PRIVACY.md).

## Install (developer mode)

1. Download or clone this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and pick this folder.
4. Pin Gif Me A Sec from the puzzle-piece menu.

## Use

1. On install, a welcome page asks for a free API key from GIPHY, Tenor or Pixabay (links to get one are right there). Any provider tab without a key shows the same key box.
2. Reload any meeting tabs that were open before you installed the extension.
3. Pick a GIF in the popup or in the quick panel in the meeting (search needs an API key, see below; URL and Upload work without one).
4. The GIF plays on your camera for 5 seconds, then you're back. It only plays when you pick a GIF (or press Replay); turning the extension on or starting your camera never plays one by itself. Search results load 9 at a time as you scroll.

Keyboard shortcuts (change them at `chrome://extensions/shortcuts`):

| Shortcut | Action |
| --- | --- |
| Alt+Shift+Q | Show the GIF quick panel on this page |
| Alt+Shift+G | Replay the GIF in the current tab |
| Alt+Shift+C | Turn Gif Me A Sec on or off |

## API keys

Each user adds their own free keys; the extension ships with none. Keys are saved only in the browser (`chrome.storage.local`) and sent only to their own service.

- **GIPHY**: create an app at [developers.giphy.com](https://developers.giphy.com/dashboard/).
- **Tenor**: enable the Tenor API in a Google Cloud project and create an API key ([quickstart](https://developers.google.com/tenor/guides/quickstart)).
- **Pixabay**: sign up at [pixabay.com](https://pixabay.com/api/docs/) and copy the key shown in the API docs. Search results are cached for 24 hours, as Pixabay asks.

## Build and publish

```sh
node scripts/build.mjs   # → dist/gif-me-a-sec-<version>.zip
```

Upload the zip in the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole). Listing text, permission justifications and store graphics are in [`store/`](store/LISTING.md).

## How it works

- `src/inject.js` runs in the page at `document_start` and wraps `navigator.mediaDevices.getUserMedia`. Each camera track is piped through `MediaStreamTrackProcessor` → `MediaStreamTrackGenerator`: camera frames pass through untouched, and while a GIF is playing, GIF frames are sent instead. The returned track keeps the real camera's label, settings and controls, and audio is untouched. Browsers without those APIs use a canvas fallback.
- GIF frames are decoded with the WebCodecs `ImageDecoder` API, so frame timing matches the original GIF.
- `panel/` is the in-meeting quick panel. It runs in an extension iframe, so the meeting page's security policy can't block its thumbnails or searches.
- `src/bridge.js` passes your settings and the selected GIF from extension storage to the page, and relays Replay from the popup.
- The page keeps the same track for the whole call, so switching between GIF and camera needs no renegotiation with the meeting.

## Test page

`test/index.html` lists cameras and previews `getUserMedia`; `test/meet.html` is a mock meeting page for trying the quick panel. Serve it over http with the extension loaded:

```sh
npx http-server test -p 8765
# then open http://localhost:8765
```

## Limitations

- The page must be reloaded after installing or updating the extension.
- Desktop apps (the Zoom or Teams apps) aren't affected; this only works in Chrome tabs.

## License

[MIT](LICENSE). GIFs found through the extension belong to their owners and are covered by the providers' terms; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
