# Telecast

Telegram media player for Android TV. React + Vite + Capacitor, with real
**MTProto** integration via [gramjs](https://github.com/gram-js/gramjs).

> **Just want to install it on a TV?** → **https://omer72.github.io/telecast/**
> Or open the *Downloader* app on your TV and enter code **4177726**.
>
> The rest of this file is for building it yourself.

A TV-native UI that signs into Telegram, surfaces movies/videos shared across
your groups, and plays them in-app or hands off to VLC / MX Player. Fully
D-pad navigable.

## What's implemented

| Layer                  | Status                                                                    |
| ---------------------- | ------------------------------------------------------------------------- |
| Phone + code login     | Real MTProto (`auth.sendCode` → `auth.signIn`), with resend + delivery info |
| 2FA cloud password     | Real — `PasswordEntry` screen calls `checkPassword()`                     |
| Session persistence    | `StringSession` in localStorage (WebView-sandboxed)                        |
| Chat / group listing   | Real (`client.getDialogs`, 100 dialogs)                                    |
| Message scanning       | Real (`client.getMessages`, last 200 per chat)                             |
| Global search          | Real (`messages.SearchGlobal` + `InputMessagesFilterVideo`, 30 results)    |
| Link / file detection  | Real — `file` (video docs), `stream` (mp4/mkv/m3u8 URLs), `magnet`, `yt`   |
| Telegram file playback | Real **seekable streaming** via service worker + `iterDownload` range requests |
| Direct streams / YT    | Real — `<video>` for stream URLs, iframe for YouTube                       |
| Subtitles              | Real — in-chat `.srt`/`.ass` fuzzy-matched, OpenSubtitles fallback, served as WebVTT |
| Resume positions       | Real — persisted per message id via `@capacitor/preferences`, toggleable in Settings |
| Favorites              | Real — starred chats persisted alongside positions                         |
| External player hand-off | Real — custom `IntentLauncher` Capacitor plugin fires `ACTION_VIEW`      |
| Magnet links           | Detected + badged; playback only via external hand-off (no torrent client) |

There is **no mock dataset**. Without credentials the app boots but every
Telegram call fails. (The old mock lived in `src/data.js` — restore it from
git history if you want a credential-free design preview.)

## Configure

1. Go to <https://my.telegram.org> → Apps → create an application.
2. Copy the **API ID** and **API hash**.
3. Make a `.env.local` in this project root:
   ```env
   VITE_TG_API_ID=1234567
   VITE_TG_API_HASH=abcdef0123456789abcdef0123456789
   ```
4. Optionally add `VITE_OPENSUBTITLES_API_KEY` / `_USERNAME` / `_PASSWORD` to
   enable the OpenSubtitles fallback. Without them, subtitles come only from
   files shared in the same chat as the video.
5. `npm run dev` — the phone-entry screen now calls real MTProto on submit.

`.env.local` is git-ignored. **Do not** put your session string under source
control; it's persisted in WebView localStorage and is equivalent to your
account password.

## Run

```bash
npm install
npm run dev          # http://localhost:5173
npm run lint         # eslint — the only automated check; there is no test suite
```

## Android TV

Needs Android Studio + SDK on PATH (`ANDROID_HOME`) and a running emulator or
attached device.

```bash
npm run emu          # boot the `telecast_tv` AVD
npm run sync         # build web bundle + copy into native project
npm run android:open # open Android Studio
# — or —
npm run android      # build + sync + cap run android (auto-deploy)
```

Manifest highlights (already configured):
- `LEANBACK_LAUNCHER` category — appears on Android TV home row
- `android.software.leanback` + `android.hardware.touchscreen` declared as not
  required (won't be filtered out for TV-only devices)
- `android:screenOrientation="landscape"`, `android:banner="@drawable/tv_banner"`
- `<queries>` block declaring VLC / MX Player / YouTube — required on Android
  11+ or `isInstalled()` silently returns false

`MainActivity` registers the `IntentLauncher` plugin before `super.onCreate()`
and disables `mediaPlaybackRequiresUserGesture` (otherwise autoplay is silent).

## Flow

`Phone entry` → `5-digit code` → `Cloud password` (if 2FA) → `Library`
(Home / Chats / Search / Settings) → `Group detail` (media grid with
FILE / STREAM / MAGNET / YT badges) → `Player` (resume, ±10s seek, subtitles,
progress-bar focus seek) → `Open with…` picker.

Navigate with ↑↓←→ + Enter. Backspace / Esc goes back. The 1920×1080 canvas
scales to fit any viewport.

## How streaming works

Telegram files aren't served over HTTP, so `<video src>` can't point at them
directly. Instead:

1. `resolveMediaUrl()` registers the document and returns `/tg-stream/<id>`.
2. `public/tg-sw.js` (a service worker, registered at boot by `initStreaming()`)
   intercepts fetches to that path.
3. The worker `postMessage`s the requested byte range to the main thread, which
   owns the gramjs client and runs `client.iterDownload()`.
4. The worker replies with `206 Partial Content`, so the video element seeks and
   scrubs like it's talking to a normal HTTP server.

Consequences worth knowing: the service worker must be *controlling* the page
before any `/tg-stream` URL is handed out, and those URLs are meaningless
outside this WebView — external-player hand-off is blocked for Telegram files
and only works for stream / magnet / YouTube URLs.

## Project layout

```
src/
  App.jsx           # screen state machine + auth flow + external picker
  main.jsx          # React mount
  styles.css        # design system, absolute 1080p pixels
  data.js           # formatters + TYPE_META constants
  api.js            # gramjs client, message scanning, SW streaming, subtitle lookup
  storage.js        # positions / favorites / prefs (Preferences + localStorage fallback)
  subtitles.js      # srt→vtt, in-chat fuzzy match, OpenSubtitles
  intent.js         # IntentLauncher plugin wrapper (web fallback: window.open)
  focus.js          # useFocusGrid — D-pad keyboard focus model
  components.jsx    # TVStage, Chrome, HintBar, Poster, ChatCard,
                    # MediaCard, Keypad, ExternalPicker
  screens.jsx       # PhoneEntry, PinEntry, PasswordEntry, Library, GroupDetail, Player
  Icon.jsx          # inline 24px stroke icons
public/tg-sw.js     # range-request service worker
android/            # Capacitor Android project (committed, incl. IntentLauncher.java)
```

`vite.config.js` polyfills a long list of Node builtins for gramjs — don't trim
it. A missing `os` polyfill surfaces as `c.default.type is not a function`.

## Known limits / next steps

1. **Magnet links have no torrent client.** They're detected and badged, but
   playback requires handing off to an external app.
2. **Bookmarks nav item** falls through to Home — not implemented.
3. **Group media is capped** at the last 200 messages per chat, cached in
   memory for the session. No pagination or incremental refresh.
4. **Subtitle lookup blocks first play** by ~1s for Telegram files, since the
   Player applies tracks at mount.
