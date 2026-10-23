# Chrome Web Store listing: Gif Me A Sec

Copy these into the Developer Dashboard (https://chrome.google.com/webstore/devconsole).

## Store listing

**Name:** Gif Me A Sec

**Summary (132 chars max):**
Drop a reaction GIF on your webcam for a few seconds in Google Meet and other web meetings. Wow, lol, bye, brb.

**Category:** Communication (alternative: Fun)

**Language:** English

**Description:**

Say it with a GIF, right on your camera.

Gif Me A Sec plays a reaction GIF on your webcam for a few seconds during any web meeting, then goes straight back to you. No virtual camera to set up and nothing to switch: your normal camera, with GIFs when you want them.

★ Quick reactions in the meeting
A small GIF button sits in the corner of your meeting. Tap it for one-click reactions (wow, lol, applause, thumbs up, bye, brb, mind blown…) or search for anything. Pick one and everyone sees it for 5 seconds.

★ Search GIPHY, Tenor and Pixabay
Add a free API key for any of them (it takes a minute; links are in the extension). You can also paste a GIF link or upload your own GIF or image.

★ Works where you meet
Google Meet, Zoom on the web, Microsoft Teams on the web, Whereby, Discord and any other site that uses your webcam in Chrome.

★ You stay in control
Choose how long the GIF plays, whether it then returns to your camera, freezes, or keeps looping, and how it's fitted. Turn it on or off mid-call; it takes effect instantly.

★ Private by design
No accounts, no tracking, no servers. Your keys, settings and GIFs stay in your browser. Searches go straight to the GIF service you chose.

Keyboard shortcuts: Alt+Shift+Q opens the quick panel, Alt+Shift+G replays the GIF, Alt+Shift+C turns it on or off.

Not affiliated with GIPHY, Tenor or Pixabay.

## Graphics (in this folder)

- Store icon 128×128: `../icons/icon128.png`
- Screenshots 1280×800: `screenshot-1-meeting.png`, `screenshot-2-popup.png`
- Small promo tile 440×280: `promo-small-440x280.png`
- Marquee promo tile 1400×560 (optional): `promo-marquee-1400x560.png`

## Privacy practices tab

**Single purpose:**
Show a short reaction GIF in place of the user's webcam video during web meetings, then return to the normal camera.

**Permission justifications:**

- *storage / unlimitedStorage*: Saves the user's settings, their own API keys and the picked GIF (or a short clip converted from a video, which can be a few MB) locally so they are ready in the next meeting.
- *Host permission: all sites (content scripts on `<all_urls>`)*: The extension must run inside whichever meeting site the user uses (Meet, Zoom web, Teams web, Whereby, Discord, others) to filter that page's camera track and show the in-meeting GIF panel. It does nothing on pages that don't use the camera.
- *Host permissions for api.giphy.com, *.giphy.com, tenor.googleapis.com, *.tenor.com, pixabay.com, cdn.pixabay.com*: To search those services with the user's own API key and download the GIF the user picks.
- *Optional host permissions (any site)*: Requested only when the user pastes a GIF link from another site, so the GIF can be downloaded.
- *Remote code*: No. All code is in the package.

**Data usage:** tick nothing. The extension does not collect or transmit user data. Certify the three disclosures (not sold, not used for unrelated purposes, not used for creditworthiness).

**Privacy policy URL:** https://github.com/ereneld/gif-me-a-sec/blob/main/PRIVACY.md
