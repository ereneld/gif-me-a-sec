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

★ Search GIPHY and Pixabay
Add a free API key for any of them (it takes a minute; links are in the extension). You can also paste a GIF link or upload your own GIF or image.

★ Works where you meet
Google Meet, Zoom on the web, Microsoft Teams on the web, Whereby, Discord and any other site that uses your webcam in Chrome.

★ You stay in control
Choose how long the GIF plays, whether it then returns to your camera, freezes, or keeps looping, and how it's fitted. Turn it on or off mid-call; it takes effect instantly.

★ Private by design: everything stays on your computer
Installing asks for no site access. You choose where it works: all sites (the default), a list of meeting sites, or your own. Chrome then asks once, and that access is only used to show GIFs on your camera in those meetings. Gif Me A Sec does not read the pages you visit, their URLs or their content, and it does not collect, store or send any of your data. The only thing it touches is your own camera video, inside your own browser.
No accounts, no tracking, no servers of ours. Your keys, settings and GIFs stay on your machine. Searches go straight to the GIF service you chose.

Keyboard shortcuts: Alt+Shift+Q opens the quick panel, Alt+Shift+G replays the GIF, Alt+Shift+C turns it on or off.

Not affiliated with GIPHY or Pixabay.

## Graphics (in this folder)

- Store icon 128×128: `../icons/icon128.png`
- Screenshots 1280×800, in this order: `screenshot-1-hero.png`, `screenshot-2-before-after.png`, `screenshot-3-gif-and-back.png`, `screenshot-4-search.png`, `screenshot-5-privacy.png`. People are Pixabay stock (free for commercial use); GIFs are real GIPHY results picked to avoid celebrities and TV characters.
- Small promo tile 440×280: `promo-small-440x280.png`
- Marquee promo tile 1400×560 (optional): `promo-marquee-1400x560.png`

## Privacy practices tab

**Single purpose:**
Show a short reaction GIF in place of the user's webcam video during web meetings, then return to the normal camera.

**Permission justifications:**

- *storage / unlimitedStorage*: Saves the user's settings, their own API keys and the picked GIF (or a short clip converted from a video, which can be a few MB) locally so they are ready in the next meeting.
- *scripting*: Gif Me A Sec asks for no site access at install. After install, the user chooses where it works (all sites by default, a list of meeting sites such as Google Meet, Zoom and Teams, or sites they add themselves), and Chrome asks for that access. The scripting permission registers the extension's own bundled camera script only on the sites the user allowed, so it can show a GIF on their webcam and the in-meeting GIF panel there. It runs no remote code, and it does not read page content, URLs or browsing data.
- *Optional host permissions (`<all_urls>`)*: Nothing is requested at install. On the welcome screen the user chooses where the extension works (all sites by default, or a list of meeting sites such as Meet, Zoom web, Teams web, Whereby, Discord, plus their own) and Chrome asks for that access then. It is needed to filter that page's camera track and show the in-meeting GIF panel; it does nothing on pages that don't use the camera. The same optional access is requested for a single site when the user pastes a GIF link from it, and for GIPHY or Pixabay when the user saves an API key for them. The extension does not read page content, URLs, browsing history or any other site data, and it sends nothing to us or anyone else; all processing happens locally in the user's browser.
- *Remote code*: No. All code is in the package.

**Data usage:** tick nothing. The extension does not collect or transmit user data. Certify the three disclosures (not sold, not used for unrelated purposes, not used for creditworthiness).

**Privacy policy URL:** https://github.com/ereneld/gif-me-a-sec/blob/main/PRIVACY.md
