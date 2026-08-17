# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # vite dev server, http://localhost:5173
npm run lint         # eslint
npm test             # node self-checks (subtitles, art, authGuard, longPress)
npm run build        # vite build → dist/
npm run sync         # build + cap sync android
npm run android      # build + sync + cap run android (deploy to device/emulator)
npm run emu          # boot the `telecast_tv` AVD
npm run publish      # copy the built release APK + version.json into docs/
```

**Releasing.** Bump `versionCode`/`versionName` in `android/app/build.gradle` —
the only place a version is authored; `vite.config.js` reads it into
`import.meta.env.VITE_APP_VERSION`/`_BUILD`, so the Settings row and the update
check follow automatically. Then `npm run sync`, `cd android && ./gradlew
assembleRelease`, and `npm run publish -- "one-line release note"`. The publish
script moves the APK, `version.json` and the landing-page label together on
purpose: `version.json` is what tells installed apps to upgrade, so one that
disagreed with the APK beside it would send people after a build that isn't
there.

Requires `.env.local` with `VITE_TG_API_ID` / `VITE_TG_API_HASH` (see `.env.example`).
Without them `api.js` logs an error and every Telegram call fails — there is **no**
mock fallback anymore; it was deleted from `data.js`.

## Architecture

React 19 + Vite SPA wrapped in Capacitor for Android TV. No router, no state
library: `App.jsx` is a single `screen` string state machine
(`phone → pin → password? → library → group → player`) plus a modal
`showExternal` picker. All screens live in `screens.jsx`, all reusable widgets
in `components.jsx`.

**Fixed 1920×1080 canvas.** `TVStage` scales the whole UI by
`min(vw/1920, vh/1080)`. Write CSS in absolute 1080p pixels; never write
responsive breakpoints.

**D-pad focus is the only input model.** `useFocusGrid(rows, {onEnter, onBack})`
in `focus.js` owns a global `keydown` listener and a `{r,c}` cursor over a
`string[][]` of focus ids. Elements opt in with `data-focus-id` (used for
`scrollIntoView`) and `focusedClass(id, focusedId)`. Only one grid should be
`enabled` at a time — modals disable the parent grid by passing a dummy row.
The listener ignores events from `INPUT`/`TEXTAREA`.

**`api.js` (~700 lines) is the whole backend.** gramjs (`telegram` package)
over WebSocket (`useWSS: true`) inside the WebView. Client is lazily built via
dynamic `import()` and cached in a module-level `_client`; session string is
persisted in `localStorage["telecast.tg.session"]` (treat as password-equivalent).
It scans recent messages per dialog and normalizes them via
`entriesFromMessage()` into `{ movie, sender, sentAgo }`, where `movie.type` is
one of `file | stream | magnet | yt` (see `TYPE_META` in `data.js`).
`movie._msg` / `_doc` / `_url` carry the raw Telegram objects downstream —
don't strip them.

**Streaming is the non-obvious part.** `resolveMediaUrl()` hands `<video>` a
`/tg-stream/<id>` URL. `public/tg-sw.js` (a service worker registered by
`initStreaming()` at boot) intercepts those fetches, `postMessage`s the byte
range to the main thread, which does `client.iterDownload()` and posts bytes
back; the SW replies `206 Partial Content` so seeking works. Consequences:
- The SW must be *controlling* the page before any `/tg-stream` URL is handed out.
- `/tg-stream` URLs are only meaningful inside this WebView — external-player
  hand-off is blocked for them in `App.handleExtEnter`.
- `refreshFileReference()` exists because Telegram file references expire mid-stream.

**Native bridge.** `intent.js` wraps the custom `IntentLauncher` Capacitor
plugin (`android/app/src/main/java/com/telecast/tv/IntentLauncher.java`,
registered in `MainActivity.onCreate` *before* `super.onCreate`) to fire
`ACTION_VIEW`. Target packages must be listed in the manifest's `<queries>`
block or Android 11+ `isInstalled` silently returns false. On web it falls
back to `window.open`.

**Preview art.** `previewArt(movie, shape)` in `api.js` resolves a card image,
first hit wins: TMDB (needs `VITE_TMDB_KEY`) → YouTube thumb → the video's own
Telegram thumbnail → `null`, where the caller keeps `movie.art`'s gradient.
`shape` is `"wide"` (16:9 cards) or `"tall"` (2:3 shelf posters) and picks
between TMDB's backdrop and poster so neither is crop-mangled. Components use
the `useArt` hook (own file — `components.jsx` must export only components).
Two traps: `bestThumb()` must hand gramjs a **PhotoSize object, never an
index** — on an unresolvable `thumb` gramjs falls through to `fileSize:
doc.size` and downloads the whole video; and thumbnails are `blob:` URLs, so
`_artCache` is capped and revokes on eviction.

**Update check.** `update.js` fetches `docs/version.json` from the Pages site
once per session and compares `versionCode` (the integer Android itself uses to
decide an upgrade is an upgrade — no version-string parsing). Surfaced as a
quiet line above the sidebar account footer and as detail on the Settings
version row. Advisory only: installing an APK in-app would need
`REQUEST_INSTALL_PACKAGES`, and Downloader already does that. It never throws —
no network still boots a working app.

**Persistence.** `storage.js` — resume positions, favorites, prefs via
`@capacitor/preferences` with a localStorage fallback, both cached in module
scope.

**Subtitles.** `subtitles.js` prefers a `.srt`/`.ass` shared in the same chat
(fuzzy filename match), falling back to OpenSubtitles if the optional
`VITE_OPENSUBTITLES_*` vars are set. Everything is converted to WebVTT blob URLs.

**Vite config matters.** gramjs needs a long list of Node polyfills
(`vite-plugin-node-polyfills`); missing `os` produces the cryptic
`c.default.type is not a function`. Don't trim that list.

## Gotchas

- `android/` is committed; `cap sync` rewrites `android/app/src/main/assets/`
  but hand-edited files (`MainActivity.java`, `IntentLauncher.java`, manifest
  `<queries>`) are safe.
- `README.md` is current; check it before assuming a feature is unimplemented.
