/**
 * Telegram MTProto service via gramjs over WebSocket — works inside the
 * Capacitor Android WebView. The session string is persisted in localStorage
 * so signed-in state survives reloads (WebView localStorage is sandboxed per
 * app).
 */

import { bestThumb, formatRuntime as _formatRuntime, tmdbQuery, youtubeId } from "./data.js";
import { loadTmdbCache, saveTmdbLookup } from "./storage.js";
import { pickInChatSubtitle, trackFromBuffer, tryOpenSubtitles } from "./subtitles.js";

const API_ID = Number(import.meta.env.VITE_TG_API_ID || 0);
const API_HASH = String(import.meta.env.VITE_TG_API_HASH || "");
const SESSION_KEY = "telecast.tg.session";

if (!API_ID || !API_HASH) {
  // Fail loud rather than booting into a broken state. Get credentials at
  // https://my.telegram.org and put them in .env.local.
  console.error("VITE_TG_API_ID / VITE_TG_API_HASH must be set in .env.local");
}

// ---------------------------------------------------------------------------
// gramjs client — lazily constructed so the mock-only path stays tiny.
// ---------------------------------------------------------------------------
let _client = null;
let _phoneCodeHash = null;
let _phoneNumber = null;

async function getClient() {
  if (_client) return _client;
  // Dynamic imports so Vite tree-shakes gramjs out of the bundle when unused.
  const { TelegramClient } = await import("telegram");
  const { StringSession } = await import("telegram/sessions/index.js");

  const saved = localStorage.getItem(SESSION_KEY) || "";
  const session = new StringSession(saved);

  _client = new TelegramClient(session, API_ID, API_HASH, {
    connectionRetries: 5,
    useWSS: true, // browser/WebView must use WebSocket transport
    autoReconnect: true,
  });
  await _client.connect();
  return _client;
}

function saveSession() {
  if (!_client) return;
  try {
    localStorage.setItem(SESSION_KEY, _client.session.save() || "");
  } catch (_) {
    /* localStorage may be disabled; signed-in state just won't persist */
  }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function isAuthenticated() {
  if (!localStorage.getItem(SESSION_KEY)) return false;
  try {
    const c = await getClient();
    return await c.checkAuthorization();
  } catch {
    return false;
  }
}

// Map Telegram's sentCode types to a friendly description.
function describeSentCode(type, nextType) {
  const cn = (t) => t?.className || "";
  const friendly = {
    SentCodeTypeApp:        "Telegram app (check your other signed-in devices)",
    SentCodeTypeSms:        "SMS",
    SentCodeTypeCall:       "phone call",
    SentCodeTypeFlashCall:  "flash call",
    SentCodeTypeMissedCall: "missed call",
    SentCodeTypeFragmentSms: "Fragment SMS",
  };
  const cur  = friendly[cn(type)]     || "unknown";
  const next = friendly[cn(nextType)] || null;
  return { current: cur, next };
}

export async function sendCode(phone) {
  const c = await getClient();
  const Api = (await import("telegram")).Api;
  try {
    const res = await c.invoke(
      new Api.auth.SendCode({
        phoneNumber: phone,
        apiId: API_ID,
        apiHash: API_HASH,
        settings: new Api.CodeSettings({}),
      })
    );
    // Loud log so we can see exactly what Telegram returned in logcat.
    console.log("[Telecast] auth.SendCode response", {
      phone,
      typeClass: res.type?.className,
      nextTypeClass: res.nextType?.className,
      timeout: res.timeout,
      phoneCodeHash: res.phoneCodeHash ? "(set)" : "(missing)",
    });
    _phoneCodeHash = res.phoneCodeHash;
    _phoneNumber = phone;
    const delivery = describeSentCode(res.type, res.nextType);
    return {
      ok: true,
      phoneCodeHash: _phoneCodeHash,
      timeout: res.timeout,
      typeClass: res.type?.className,
      ...delivery,
    };
  } catch (err) {
    console.error("[Telecast] auth.SendCode failed", err);
    return { ok: false, error: err?.errorMessage || String(err) };
  }
}

/**
 * Ask Telegram to send another code. The second send often escalates the
 * delivery type — e.g. from in-app to SMS.
 */
export async function resendCode() {
  if (!_phoneNumber || !_phoneCodeHash) {
    return { ok: false, error: "No active sign-in attempt" };
  }
  const c = await getClient();
  const Api = (await import("telegram")).Api;
  try {
    const res = await c.invoke(
      new Api.auth.ResendCode({
        phoneNumber: _phoneNumber,
        phoneCodeHash: _phoneCodeHash,
      })
    );
    _phoneCodeHash = res.phoneCodeHash; // hash can change on resend
    const delivery = describeSentCode(res.type, res.nextType);
    return { ok: true, timeout: res.timeout, ...delivery };
  } catch (err) {
    return { ok: false, error: err?.errorMessage || String(err) };
  }
}

export async function signIn(code) {
  const c = await getClient();
  const Api = (await import("telegram")).Api;
  try {
    await c.invoke(
      new Api.auth.SignIn({
        phoneNumber: _phoneNumber,
        phoneCodeHash: _phoneCodeHash,
        phoneCode: code,
      })
    );
    saveSession();
    return { ok: true };
  } catch (err) {
    // Cloud password (2FA) — the design doesn't have a screen for this; the
    // caller can show the message and prompt the user to disable 2FA or add
    // a follow-up screen later.
    if (err.errorMessage === "SESSION_PASSWORD_NEEDED") {
      return { ok: false, needsPassword: true };
    }
    return { ok: false, error: err.errorMessage || String(err) };
  }
}

/**
 * Check the cloud password (2FA). Only call if signIn returned needsPassword.
 */
export async function checkPassword(password) {
  const c = await getClient();
  const { Api } = await import("telegram");
  const { computeCheck } = await import("telegram/Password.js");
  try {
    const passwordInfo = await c.invoke(new Api.account.GetPassword());
    const srp = await computeCheck(passwordInfo, password);
    await c.invoke(new Api.auth.CheckPassword({ password: srp }));
    saveSession();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.errorMessage || String(err) };
  }
}

export async function logout() {
  localStorage.removeItem(SESSION_KEY);
  _me = null;
  _groupsCache = null;
  _mediaCache.clear();
  _subsCache.clear();
  if (!_client) return;
  try {
    await _client.invoke(new (await import("telegram")).Api.auth.LogOut());
  } catch {
    /* ignore */
  }
  try {
    await _client.disconnect();
  } catch {
    /* ignore */
  }
  _client = null;
}

// ---------------------------------------------------------------------------
// Data — groups + media
// ---------------------------------------------------------------------------

const palettes = [
  "linear-gradient(135deg, #2ea6ff, #5fc1ff)",
  "linear-gradient(135deg, #8b5cf6, #ec4899)",
  "linear-gradient(135deg, #10b981, #34d399)",
  "linear-gradient(135deg, #f59e0b, #f97316)",
  "linear-gradient(135deg, #ef4444, #f87171)",
  "linear-gradient(135deg, #14b8a6, #2dd4bf)",
  "linear-gradient(135deg, #6366f1, #818cf8)",
];
const posters = [
  "linear-gradient(165deg, #6b3a1f 0%, #c97b4a 35%, #2a1810 100%)",
  "linear-gradient(165deg, #0a1729 0%, #1e3a5f 60%, #f5e4b4 100%)",
  "linear-gradient(165deg, #022c22 0%, #064e3b 50%, #000 100%)",
  "linear-gradient(165deg, #1a1a1a 0%, #b45309 60%, #000 100%)",
  "linear-gradient(165deg, #ff6b35 0%, #c2410c 50%, #1a0a0a 100%)",
  "linear-gradient(165deg, #166534 0%, #14532d 50%, #052e16 100%)",
  "linear-gradient(165deg, #581c87 0%, #6b21a8 50%, #2e1065 100%)",
  "linear-gradient(165deg, #be185d 0%, #831843 50%, #18181b 100%)",
];

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function paletteFor(s) { return palettes[hashString(s) % palettes.length]; }
function posterFor(s)  { return posters[hashString(s) % posters.length]; }

// ---------------------------------------------------------------------------
// Preview art
//
// Resolution order, first hit wins:
//   1. TMDB artwork   — real cover art, needs VITE_TMDB_KEY
//   2. YouTube thumb  — keyless img.youtube.com URL
//   3. Telegram thumb — a real frame off the video document
//   4. null           — caller falls back to movie.art's gradient
//
// Callers pass the shape of the box they're filling. Cards are 16:9 and want
// TMDB's backdrop; shelf posters are 2:3 and want the poster. Putting a
// portrait poster behind `cover` in a 16:9 box crops it to a middle strip.
// ---------------------------------------------------------------------------

const TMDB_KEY = String(import.meta.env.VITE_TMDB_KEY || "");

// "movieId|shape" -> Promise<string|null>. Caching the *promise* (not the
// resolved value) also dedupes the burst of identical requests you get when a
// grid of cards mounts at once, and survives a card unmounting mid-download.
const _artCache = new Map();
const MAX_CACHED_ART = 300;

// Telegram downloads are serialized on one connection, so a grid mounting 30
// cards would queue 30 thumbnail fetches ahead of anything else the user does.
// Cap how many are in flight; the rest wait their turn.
// ponytail: fixed cap, swap for focus-cursor-driven prefetch if it still drags.
const MAX_INFLIGHT = 4;
let _inflight = 0;
const _queue = [];

function withLimit(fn) {
  return new Promise((resolve) => {
    const run = async () => {
      _inflight++;
      try { resolve(await fn()); }
      finally {
        _inflight--;
        _queue.shift()?.();
      }
    };
    if (_inflight < MAX_INFLIGHT) run();
    else _queue.push(run);
  });
}

function ytThumb(movie) {
  if (movie.type !== "yt") return null;
  const id = youtubeId(movie._url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
}

async function tgThumb(movie) {
  if (!movie._msg) return null;
  const thumb = bestThumb(movie._doc);
  if (!thumb) return null;
  const client = await getClient();
  // Tens of KB. Stripped sizes resolve from bytes already in hand, no network.
  const buf = await client.downloadMedia(movie._msg, { thumb });
  if (!buf?.length) return null;
  return URL.createObjectURL(new Blob([buf]));
}

async function tmdbArt(movie, shape) {
  if (!TMDB_KEY) return null;
  const title = tmdbQuery(movie.title);
  if (!title) return null;

  const key = `${title}|${movie.year || ""}|${shape}`;
  const cached = await loadTmdbCache();
  // A previous miss is stored as null — present but falsy, so check the key.
  if (key in cached) return cached[key];

  let url = null;
  try {
    const qs = new URLSearchParams({
      api_key: TMDB_KEY,
      query: title,
      include_adult: "false",
    });
    if (movie.year) qs.set("year", String(movie.year));
    const res = await fetch(`https://api.themoviedb.org/3/search/movie?${qs}`);
    if (!res.ok) throw new Error(`TMDB ${res.status}`);
    const hit = (await res.json()).results?.[0];
    // Prefer the shape that fits the box, but a wrong-shape image still beats
    // a gradient, so fall back to whichever one this title actually has.
    const path = shape === "tall"
      ? hit?.poster_path || hit?.backdrop_path
      : hit?.backdrop_path || hit?.poster_path;
    if (path) url = `https://image.tmdb.org/t/p/w780${path}`;
  } catch (err) {
    // Don't cache a network failure as "no such film" — leave it unresolved so
    // the next launch retries. Only a real answer gets written below.
    console.warn("[Telecast] TMDB lookup failed", title, err);
    return null;
  }

  await saveTmdbLookup(key, url);
  return url;
}

/**
 * Resolve a real preview image for a card.
 * `shape` is "wide" (16:9 card) or "tall" (2:3 poster).
 * Returns a CSS background value (`url("…")`) or null to keep the gradient.
 */
export function previewArt(movie, shape = "wide") {
  const cacheKey = `${movie.id}|${shape}`;
  if (_artCache.has(cacheKey)) return _artCache.get(cacheKey);

  // Telegram thumbnails are blob: URLs, which live until revoked. A TV session
  // runs for hours across a big library, so bound the cache and hand the bytes
  // back on eviction. The cap is far above anything on screen at once, so an
  // evicted entry is long out of view; scrolling back just re-fetches it.
  const evict = () => {
    while (_artCache.size > MAX_CACHED_ART) {
      const [oldest] = _artCache.keys(); // Map iterates in insertion order
      const stale = _artCache.get(oldest);
      _artCache.delete(oldest);
      Promise.resolve(stale)
        .then((css) => {
          const blob = /url\("(blob:[^"]+)"\)/.exec(css || "")?.[1];
          if (blob) URL.revokeObjectURL(blob);
        })
        .catch(() => {});
    }
  };

  const p = withLimit(async () => {
    const url =
      ytThumb(movie) ||
      (await tmdbArt(movie, shape)) ||
      (await tgThumb(movie).catch((err) => {
        // Don't let one bad thumbnail break a grid, but don't hide it either —
        // a silent catch here is what made the last bug invisible.
        console.warn("[Telecast] thumbnail failed", movie.title, err);
        return null;
      }));
    return url ? `url("${url}") center / cover no-repeat` : null;
  });

  _artCache.set(cacheKey, p);
  evict();
  return p;
}

function initialsOf(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ---------- link / file detection ----------
const MAGNET_RE = /magnet:\?xt=urn:btih:[a-zA-Z0-9]+/g;
const YT_RE = /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+/g;
const STREAM_RE = /https?:\/\/\S+\.(?:mp4|mkv|m3u8|webm|mov|avi)(?:\?\S*)?/gi;

const QUALITY_RE = /\b(4k|2160p|1080p|720p|480p|hdr)\b/i;
const YEAR_RE = /\b(19[5-9]\d|20[0-4]\d)\b/;

function detectQuality(text) {
  const m = (text || "").match(QUALITY_RE);
  if (!m) return "1080p";
  const q = m[1].toUpperCase();
  if (q === "2160P" || q === "4K") return "4K";
  if (q === "HDR") return "4K HDR";
  return q;
}
function detectYear(text) {
  const m = (text || "").match(YEAR_RE);
  return m ? Number(m[0]) : new Date().getFullYear();
}
function tidyTitle(text) {
  // Strip common release-group cruft / extension / quality tokens
  return (text || "")
    .replace(/\.(mkv|mp4|webm|mov|avi)$/i, "")
    .replace(/[._]/g, " ")
    .replace(/\b(1080p|720p|2160p|4k|hdr|x264|x265|h264|h265|hevc|aac|web-?dl|bluray|remux|amzn|nf|hmax)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim() || "Untitled";
}
function formatSize(bytes) {
  if (!bytes) return null;
  const gb = bytes / 1024 / 1024 / 1024;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(0)} MB`;
}

/**
 * Turn a Telegram Message into 0+ media "entries" matching the UI shape:
 *   { movie: { id, title, year, runtime, rating, quality, art, type, size, ext, progress, _msg }, sender, sentAgo }
 */
function entriesFromMessage(msg, senderName) {
  const text = (msg.message || "") + " " + (msg.media?.document?.attributes?.find?.(a => a.fileName)?.fileName || "");
  const out = [];

  // 1) Video / document attachment
  const doc = msg.media?.document;
  if (doc && (doc.mimeType?.startsWith("video/") || /\.(mkv|mp4|webm|mov|avi)$/i.test(text))) {
    const filenameAttr = doc.attributes?.find?.((a) => a.className === "DocumentAttributeFilename");
    const videoAttr = doc.attributes?.find?.((a) => a.className === "DocumentAttributeVideo");
    const filename = filenameAttr?.fileName || msg.message || `video-${msg.id}`;
    const title = tidyTitle(filename);
    out.push({
      id: `msg-${msg.id}`,
      title,
      year: detectYear(filename),
      runtime: videoAttr?.duration ? Math.max(1, Math.round(videoAttr.duration / 60)) : 90,
      rating: "?",
      quality: detectQuality(filename),
      art: posterFor(title),
      type: "file",
      size: formatSize(Number(doc.size) || 0),
      ext: (filename.match(/\.(\w+)$/) || [, "mp4"])[1].toLowerCase(),
      progress: 0,
      _msg: msg,
      _doc: doc,
    });
  }

  // 2) URL classification from message body
  const body = msg.message || "";
  for (const url of body.match(MAGNET_RE) || []) {
    out.push({
      id: `msg-${msg.id}-magnet`, title: tidyTitle(body.replace(url, "")) || "Magnet link",
      year: detectYear(body), runtime: 120, rating: "?", quality: detectQuality(body),
      art: posterFor(url), type: "magnet", size: null, ext: "torrent", progress: 0,
      _msg: msg, _url: url,
    });
  }
  for (const url of body.match(YT_RE) || []) {
    out.push({
      id: `msg-${msg.id}-yt`, title: tidyTitle(body.replace(url, "")) || "YouTube video",
      year: detectYear(body), runtime: 10, rating: "?", quality: "1080p",
      art: posterFor(url), type: "yt", size: null, ext: "url", progress: 0,
      _msg: msg, _url: url,
    });
  }
  for (const url of body.match(STREAM_RE) || []) {
    out.push({
      id: `msg-${msg.id}-stream`, title: tidyTitle(body.replace(url, "")) || "Direct stream",
      year: detectYear(body), runtime: 100, rating: "?", quality: detectQuality(url),
      art: posterFor(url), type: "stream", size: null,
      ext: (url.match(/\.(\w+)(?:\?|$)/) || [, "mp4"])[1].toLowerCase(),
      progress: 0, _msg: msg, _url: url,
    });
  }

  return out.map((movie) => ({
    movie,
    sender: senderName || "@user",
    sentAgo: relativeAgo(msg.date),
  }));
}

// Detect a subtitle attachment on a message. Returns { filename, doc } or null.
function subtitleFromMessage(msg) {
  const doc = msg.media?.document;
  if (!doc) return null;
  const filenameAttr = doc.attributes?.find?.((a) => a.className === "DocumentAttributeFilename");
  const filename = filenameAttr?.fileName || "";
  const mime = doc.mimeType || "";
  const looksLikeSub =
    /\.(srt|vtt|ass|ssa)$/i.test(filename) ||
    mime === "application/x-subrip" ||
    mime === "text/vtt";
  if (!looksLikeSub) return null;
  return { id: msg.id, msg, doc, filename, date: msg.date };
}

function relativeAgo(unixSec) {
  if (!unixSec) return "";
  const diff = Date.now() / 1000 - unixSec;
  if (diff < 3600) return `${Math.max(1, Math.round(diff / 60))}m`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h`;
  if (diff < 86400 * 7) return `${Math.round(diff / 86400)}d`;
  return `${Math.round(diff / 86400 / 7)}w`;
}

// ---------- public data API ----------

let _groupsCache = null;
let _mediaCache = new Map(); // groupId → entries[]
let _subsCache = new Map();  // groupId → [{ id, msg, doc, filename, date }]

/**
 * Return the list of groups + channels the user is in. Each is shaped with
 * the fields the Library/Chats UI expects (name, avatar, palette, movies…).
 */
export async function getGroups() {
  if (_groupsCache) return _groupsCache;

  const c = await getClient();
  // Raised from 100 when one-to-one chats started counting toward the same
  // budget — with DMs included, 100 was truncating people's group list.
  const dialogs = await c.getDialogs({ limit: 200 });

  const groups = [];
  for (const d of dialogs) {
    // One-to-one chats are included: people stash films in DMs and, very
    // often, in Saved Messages. Anything that isn't a group, channel or user
    // dialog (an unresolved peer, say) still gets skipped.
    if (!d.isGroup && !d.isChannel && !d.isUser) continue;
    // Saved Messages is the dialog whose peer is your own account. Telegram
    // returns it under your display name, which is confusing in a chat list.
    const isSaved = Boolean(d.entity?.self);
    const name = isSaved ? "Saved Messages" : (d.title || d.name || "Untitled");
    const kind = isSaved ? "Saved"
               : d.isChannel ? "Channel"
               : d.isGroup ? "Group"
               : d.entity?.bot ? "Bot"
               : "Private";
    groups.push({
      id: String(d.id),
      _peer: d.inputEntity,
      name,
      kind,
      members: d.entity?.participantsCount || 0,
      palette: paletteFor(name),
      avatar: isSaved ? "★" : initialsOf(name),
      description: `${kind === "Private" ? "Private chat" : kind === "Saved" ? "Saved Messages" : kind} · Telegram`,
      movieIds: [],
      movies: [], // lazy-loaded by getMedia()
      unread: d.unreadCount || 0,
      lastMessage: d.message?.message?.slice(0, 80) || "",
    });
  }
  // Saved Messages first when present — it's the one chat that's definitely
  // yours, and the most likely place to have parked something to watch.
  groups.sort((a, b) => Number(b.kind === "Saved") - Number(a.kind === "Saved"));
  _groupsCache = groups;
  return groups;
}

/**
 * Detected media entries for a group: last ~200 messages scanned for video
 * attachments, magnet/stream/YouTube URLs.
 */
export async function getMedia(groupId) {
  if (_mediaCache.has(groupId)) return _mediaCache.get(groupId);

  const groups = await getGroups();
  const g = groups.find((x) => x.id === groupId);
  if (!g) return [];

  const c = await getClient();
  const messages = await c.getMessages(g._peer, { limit: 200 });

  const entries = [];
  const subs = [];
  for (const msg of messages) {
    const senderName = msg.sender?.firstName || msg.sender?.username || "@user";
    for (const e of entriesFromMessage(msg, senderName)) {
      // Stamp the group id so resolveMediaUrl can find subtitles later.
      e.movie._groupId = groupId;
      entries.push(e);
    }
    const sub = subtitleFromMessage(msg);
    if (sub) subs.push(sub);
  }

  // Patch the group with the discovered movies so the home shelf / hero work.
  g.movies = entries.map((e) => e.movie);
  g.movieIds = g.movies.map((m) => m.id);

  _mediaCache.set(groupId, entries);
  _subsCache.set(groupId, subs);
  return entries;
}

/**
 * Search Telegram globally for video-bearing messages matching the query.
 * Returns up to ~30 entries in the same shape as getMedia().
 */
export async function searchGlobalMedia(query) {
  if (!query?.trim()) return [];
  const client = await getClient();
  const { Api } = await import("telegram");
  try {
    const result = await client.invoke(new Api.messages.SearchGlobal({
      q: query,
      filter: new Api.InputMessagesFilterVideo(),
      minDate: 0,
      maxDate: 0,
      offsetRate: 0,
      offsetPeer: new Api.InputPeerEmpty(),
      offsetId: 0,
      limit: 30,
    }));
    // Build peer-id → chat-name + palette/avatar for nicer display.
    const peerMap = new Map();
    for (const ch of result.chats || []) peerMap.set(String(ch.id), { name: ch.title || ch.username, kind: "chat" });
    for (const u  of result.users  || []) peerMap.set(String(u.id),  { name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username, kind: "user" });

    const entries = [];
    for (const msg of result.messages || []) {
      // Resolve the chat label so MediaCard shows useful provenance.
      const peerId = String(
        msg.peerId?.channelId || msg.peerId?.chatId || msg.peerId?.userId || ""
      );
      const peerName = peerMap.get(peerId)?.name || "Telegram";
      for (const e of entriesFromMessage(msg, peerName)) {
        // No _groupId for global results — subtitles fall straight through to
        // the OpenSubtitles path (no in-chat candidates to match against).
        entries.push(e);
      }
    }
    return entries;
  } catch (err) {
    console.error("SearchGlobal failed:", err);
    return [];
  }
}

// =============================================================================
// Service Worker streaming for Telegram-hosted files
// =============================================================================
// The <video> element issues HTTP range requests against /tg-stream/<id>,
// which our service worker (public/tg-sw.js) intercepts and forwards here.
// We download just the requested byte range via gramjs.iterDownload and post
// it back. This matches Telegram Web's streaming behavior — instant playback,
// seeking works, no full-file buffering.

const _streams = new Map(); // streamId -> { msg, doc, size, mimeType }

export async function initStreaming() {
  if (!("serviceWorker" in navigator)) {
    console.warn("Service workers unavailable — Telegram files will full-download instead of stream.");
    return;
  }
  try {
    await navigator.serviceWorker.register("/tg-sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    navigator.serviceWorker.addEventListener("message", handleSWMessage);
  } catch (err) {
    console.error("SW register failed:", err);
  }
}

async function fetchRange(ctx, offset, length) {
  const client = await getClient();
  const bigInt = (await import("big-integer")).default;
  // Telegram chunks must be aligned to 4 KB; the requestSize must be a power
  // of 2 in [4 KB, 1 MB]. Align down + slice the exact requested bytes out.
  const ALIGN = 4096;
  const alignedStart = Math.floor(offset / ALIGN) * ALIGN;
  const skip = offset - alignedStart;
  const need = length + skip;

  let req = 4096;
  while (req < Math.min(need, 1024 * 1024)) req *= 2;

  const out = [];
  let got = 0;
  for await (const chunk of client.iterDownload({
    file: ctx.location,
    offset: bigInt(alignedStart),
    limit: bigInt(ctx.size),
    requestSize: req,
  })) {
    out.push(chunk);
    got += chunk.length;
    if (got >= need) break;
  }
  const full = Buffer.concat(out);
  return full.slice(skip, skip + length);
}

// Re-fetch the message to get a fresh file_reference, rebuild the location
// in-place on ctx. Returns true on success.
async function refreshFileReference(ctx) {
  if (!ctx.msg) return false;
  try {
    const client = await getClient();
    const { Api } = await import("telegram");
    const peer = ctx.msg.peerId || ctx.msg.chatId;
    const refreshed = await client.getMessages(peer, { ids: [ctx.msg.id] });
    const doc = refreshed?.[0]?.media?.document;
    if (!doc) return false;
    ctx.msg = refreshed[0];
    ctx.doc = doc;
    ctx.location = new Api.InputDocumentFileLocation({
      id: doc.id,
      accessHash: doc.accessHash,
      fileReference: doc.fileReference,
      thumbSize: "",
    });
    return true;
  } catch (err) {
    console.error("file reference refresh failed:", err);
    return false;
  }
}

async function handleSWMessage(e) {
  const data = e.data;
  if (data?.type !== "tg-chunk-request") return;
  const { requestId, streamId, offset, length } = data;
  const ctx = _streams.get(streamId);
  const reply = (payload) => e.source?.postMessage({ type: "tg-chunk-response", requestId, ...payload });
  if (!ctx) return reply({ error: "stream not registered" });

  // Metadata probe — SW asks for size + mime before issuing the first range.
  if (offset === -1) return reply({ size: ctx.size, mimeType: ctx.mimeType });

  const isRefError = (err) => {
    const msg = err?.errorMessage || err?.message || "";
    return msg.includes("FILE_REFERENCE_EXPIRED") || msg.includes("FILE_REFERENCE_");
  };

  let slice;
  try {
    slice = await fetchRange(ctx, offset, length);
  } catch (err) {
    // The file reference Telegram handed us at resolve time can expire (~1h).
    // Refresh it once and retry transparently — the user shouldn't see a
    // mid-stream failure for stale references.
    if (isRefError(err) && await refreshFileReference(ctx)) {
      try {
        slice = await fetchRange(ctx, offset, length);
      } catch (err2) {
        console.error("tg chunk fetch failed after ref refresh:", err2);
        return reply({ error: String(err2?.message || err2) });
      }
    } else {
      console.error("tg chunk fetch failed:", err);
      return reply({ error: String(err?.message || err) });
    }
  }

  // Transfer the buffer so it doesn't get copied across the message channel.
  const ab = slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength);
  e.source.postMessage({ type: "tg-chunk-response", requestId, buffer: ab }, [ab]);
}

// ---------------------------------------------------------------------------
// Export to disk — for handing a Telegram-hosted file to an external player.
// ---------------------------------------------------------------------------
// /tg-stream URLs only resolve inside this WebView (the service worker
// synthesises them), so VLC & co. can't touch them. The only way out is a real
// file on disk that we expose through the Android FileProvider. That means
// waiting for the whole download — there's no seekable hand-off.

const EXPORT_DIR = "telecast";
// Bytes accumulated in memory before each write. The bridge takes base64, so
// bigger batches mean fewer (but heavier) crossings; 4 MB is a decent middle.
const FLUSH_AT = 4 * 1024 * 1024;

function toBase64(u8) {
  let s = "";
  const CH = 0x8000; // avoid "too many arguments" on big arrays
  for (let i = 0; i < u8.length; i += CH) {
    s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  }
  return btoa(s);
}

/**
 * Download a Telegram document into the app cache and return its absolute
 * path. Resumes nothing — but if a complete copy is already cached it's
 * reused. onProgress receives (receivedBytes, totalBytes).
 */
export async function exportFileToCache(movie, onProgress, shouldCancel) {
  const doc = movie?._doc;
  if (!doc) throw new Error("Not a Telegram file");
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const { Api } = await import("telegram");
  const bigInt = (await import("big-integer")).default;

  const filenameAttr = doc.attributes?.find?.((a) => a.className === "DocumentAttributeFilename");
  // Keep the extension — players sniff it — but strip anything path-ish.
  const safeName = (filenameAttr?.fileName || `${movie.id}.mp4`).replace(/[/\\?%*:|"<>]/g, "_");
  const path = `${EXPORT_DIR}/${safeName}`;
  const total = Number(doc.size) || 0;

  // Already downloaded in full? Hand back the existing copy.
  try {
    const stat = await Filesystem.stat({ path, directory: Directory.Cache });
    if (Number(stat.size) === total) {
      onProgress?.(total, total);
      return (stat.uri || "").replace(/^file:\/\//, "");
    }
  } catch { /* not cached yet */ }

  await Filesystem.writeFile({ path, data: "", directory: Directory.Cache, recursive: true });

  const client = await getClient();
  const location = new Api.InputDocumentFileLocation({
    id: doc.id, accessHash: doc.accessHash, fileReference: doc.fileReference, thumbSize: "",
  });

  let pending = [];
  let pendingBytes = 0;
  let received = 0;
  const flush = async () => {
    if (!pendingBytes) return;
    const merged = Buffer.concat(pending);
    pending = [];
    pendingBytes = 0;
    await Filesystem.appendFile({ path, data: toBase64(merged), directory: Directory.Cache });
  };

  for await (const chunk of client.iterDownload({
    file: location,
    offset: bigInt(0),
    limit: bigInt(total),
    requestSize: 1024 * 1024,
  })) {
    if (shouldCancel?.()) {
      await Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => {});
      throw new Error("cancelled");
    }
    pending.push(chunk);
    pendingBytes += chunk.length;
    received += chunk.length;
    if (pendingBytes >= FLUSH_AT) await flush();
    onProgress?.(received, total);
  }
  await flush();

  const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
  return uri.replace(/^file:\/\//, "");
}

// ---------------------------------------------------------------------------
// Subtitle resolution
// ---------------------------------------------------------------------------

const _subBlobs = new Set(); // remember blob: URLs so we can revoke them later

async function findSubtitleForVideo(movie) {
  // 1) In-chat — does this group have a .srt/.vtt that matches by filename?
  const groupId = movie._groupId;
  const candidates = (groupId && _subsCache.get(groupId)) || [];
  const filenameAttr = movie._doc?.attributes?.find?.((a) => a.className === "DocumentAttributeFilename");
  const filename = filenameAttr?.fileName || movie.title || "";
  const match = candidates.length ? pickInChatSubtitle(filename, candidates) : null;
  console.info("[subs] video:", filename, "| in-chat candidates:", candidates.length, "| matched:", match?.filename || "none");
  if (match) {
    try {
      const client = await getClient();
      const buf = await client.downloadMedia(match.msg);
      const track = trackFromBuffer(buf, match.filename);
      _subBlobs.add(track.url);
      return track;
    } catch (err) {
      console.warn("in-chat subtitle download failed:", err);
    }
  }

  // 2) OpenSubtitles fallback — the raw filename carries the release name
  // (SxxExx, year), which searches far better than the tidied-up title.
  const os = await tryOpenSubtitles(movie, filename);
  if (os) {
    _subBlobs.add(os.url);
    return os;
  }
  return null;
}

export function revokeSubtitleBlobs() {
  for (const url of _subBlobs) {
    try { URL.revokeObjectURL(url); } catch { /* ignore */ }
  }
  _subBlobs.clear();
}

/**
 * Resolve a movie object to something the Player can render. Returns:
 *   { kind: "video", url, tracks? } | { kind: "iframe", url } | { kind: "external", url } | { kind: "unsupported", reason }
 */
export async function resolveMediaUrl(movie) {
  if (!movie?._msg && !movie?._url) {
    return { kind: "unsupported", reason: "No playable source on this item." };
  }
  if (movie.type === "yt")     return { kind: "iframe", url: movie._url };
  if (movie.type === "stream") return { kind: "video", url: movie._url };
  if (movie.type === "magnet") return { kind: "external", url: movie._url };
  if (movie.type === "file") {
    if (!navigator.serviceWorker?.controller) {
      return { kind: "unsupported", reason: "Streaming worker not active — reload the app and try again." };
    }
    // Build an InputDocumentFileLocation gramjs can use for iterDownload.
    const { Api } = await import("telegram");
    const doc = movie._doc;
    const location = new Api.InputDocumentFileLocation({
      id: doc.id,
      accessHash: doc.accessHash,
      fileReference: doc.fileReference,
      thumbSize: "",
    });
    // Use the doc id as the stream id — stable across re-resolves.
    const streamId = `doc-${doc.id.toString()}`;
    _streams.set(streamId, {
      msg: movie._msg,
      doc,
      location,
      size: Number(doc.size),
      mimeType: doc.mimeType || "video/mp4",
    });
    // Best-effort subtitle search — runs in parallel; we await it because
    // the Player applies tracks at mount and a late-arriving track wouldn't
    // be picked up cleanly. ~1s extra on first play.
    const track = await findSubtitleForVideo(movie);
    return {
      kind: "video",
      url: `/tg-stream/${streamId}`,
      tracks: track ? [track] : [],
    };
  }
  return { kind: "unsupported", reason: "Unknown media type" };
}

// Re-export the runtime formatter for screens that already import it from here.
export { _formatRuntime as formatRuntime };

// ---------------------------------------------------------------------------
// Signed-in user
// ---------------------------------------------------------------------------

let _me = null;
export async function getMe() {
  if (_me) return _me;
  const c = await getClient();
  const u = await c.getMe();
  const first = u.firstName || "";
  const last = u.lastName || "";
  const name = [first, last].filter(Boolean).join(" ") || u.username || "Telegram user";
  const initials = (first[0] || "?") + (last[0] || "");
  _me = {
    name,
    phone: u.phone ? `+${u.phone}` : "",
    username: u.username || "",
    avatar: initials.toUpperCase(),
    avatarColor: paletteFor(name),
  };
  return _me;
}
