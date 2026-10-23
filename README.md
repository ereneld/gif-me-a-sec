# GifCam

A Chrome extension that uses a GIF as your camera in Google Meet, Zoom (web), Microsoft Teams (web), Whereby, Discord and any other site that asks for your webcam.

- **Animated**: the GIF plays for a set time (5 seconds by default, adjustable), then freezes on the last frame, switches to your real camera, or keeps looping.
- **Still frame**: shows a single frame as a static picture.
- **Pick GIFs** from GIPHY or Tenor search, Pixabay videos and images, a direct link, or an uploaded file (GIF, WebP, PNG, JPEG). Pixabay videos are converted to a 10-second, 10 fps clip in the popup.
- **Live controls**: change settings mid-call, replay the GIF, or turn GifCam off to hand the stream back to your real camera without rejoining.

## Install (developer mode)

1. Download or clone this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and pick this folder.
4. Pin GifCam from the puzzle-piece menu.

## Use

1. Open the GifCam popup and pick a GIF (search needs an API key, see below; URL and Upload work without one).
2. Turn the switch on.
3. In your meeting, start the camera, or turn it off and on again if it was already running. GifCam also appears as a camera called **GifCam (virtual camera)** in the meeting's device list.

Keyboard shortcuts (change them at `chrome://extensions/shortcuts`):

| Shortcut | Action |
| --- | --- |
| Alt+Shift+G | Replay the GIF in the current tab |
| Alt+Shift+C | Turn GifCam on or off |

## API keys

- **GIPHY**: create a free app at [developers.giphy.com](https://developers.giphy.com/dashboard/) and paste its API key into the popup under **API keys**.
- **Tenor**: enable the Tenor API in a Google Cloud project and create an API key ([quickstart](https://developers.google.com/tenor/guides/quickstart)).

- **Pixabay**: sign in at [pixabay.com](https://pixabay.com/api/docs/) and copy the key shown in the API docs. Search results are cached for 24 hours, as Pixabay asks.

Keys are stored only in your browser (`chrome.storage.local`).

## How it works

- `src/inject.js` runs in the page at `document_start` and wraps `navigator.mediaDevices.getUserMedia` and `enumerateDevices`. When GifCam is on, a video request gets a `canvas.captureStream()` track that plays the GIF; audio still comes from your real microphone.
- GIF frames are decoded with the WebCodecs `ImageDecoder` API, so frame timing matches the original GIF.
- `src/bridge.js` passes your settings and the selected GIF from extension storage to the page, and relays Replay from the popup.
- The canvas keeps a single track for the whole call, so switching between GIF, still frame and real camera needs no renegotiation with the meeting.

## Test page

`test/index.html` is a small page that lists cameras and previews `getUserMedia`. Serve it over http with the extension loaded:

```sh
npx http-server test -p 8765
# then open http://localhost:8765
```

## Limitations

- The page must be reloaded after installing or updating the extension.
- Desktop apps (the Zoom or Teams apps) aren't affected; this only works in Chrome tabs.
- Some sites check the camera before GifCam's settings load; restarting the camera in the meeting fixes that.

## License

MIT
