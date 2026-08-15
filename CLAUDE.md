# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # vite dev server, http://localhost:5173
npm run lint         # eslint (the only check — there is no test suite)
npm run build        # vite build → dist/
npm run sync         # build + cap sync android
npm run android      # build + sync + cap run android (deploy to device/emulator)
npm run emu          # boot the `telecast_tv` AVD
```

Requires `.env.local` with `VITE_TG_API_ID` / `VITE_TG_API_HASH` (see `.env.example`).
Without them `api.js` logs an error and every Telegram call fails — there is **no**
mock fallback anymore (README still claims one; it was deleted from `data.js`).

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
- `README.md` is stale on several points (mock dataset, external-intent stub,
  resume positions, subtitles) — all of those are now implemented.
