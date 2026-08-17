// Utilities + shared constants. The mock dataset that used to live here was
// removed once real Telegram integration was verified end-to-end. If you ever
// need to test the UI without credentials, restore the file from git history.

export function formatRuntime(min) {
  const h = Math.floor(min / 60);
  const mm = min % 60;
  return h > 0 ? `${h}h ${mm}m` : `${mm}m`;
}

export function fmtClock(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m2 = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m2).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m2}:${ss}`;
}

// Video id out of any YouTube URL shape we see in chat. Lives here rather than
// in api.js so the self-check can import it without pulling in import.meta.env.
export function youtubeId(url) {
  const m = String(url || "").match(/(?:v=|youtu\.be\/|embed\/|shorts\/|\/v\/)([\w-]{11})/);
  return m ? m[1] : null;
}

// A filename-derived title, cleaned up enough to search TMDB with, or null if
// there's nothing worth searching for. tidyTitle() has already stripped the
// release-group cruft; this removes what's left that would break a match.
const NOT_A_FILM = new Set(["untitled", "magnet link", "youtube video", "direct stream"]);
export function tmdbQuery(title) {
  const q = String(title || "")
    // Season/episode markers — TMDB's movie search can't use them.
    .replace(/\b(s\d{1,2}\s?e\d{1,2}|\d{1,2}x\d{2})\b.*$/i, "")
    .replace(/[[\](){}]/g, " ")
    .replace(/[-_.]+/g, " ")
    // Drop a trailing release year (passed as its own search param), but only
    // if it could actually BE a release year. "Blade Runner 2049" and "2001 A
    // Space Odyssey" keep their numbers; "The Matrix 1999" loses its.
    .replace(/\s+(\d{4})\s*$/, (m, y) =>
      Number(y) >= 1900 && Number(y) <= new Date().getFullYear() + 1 ? "" : m
    )
    .replace(/\s{2,}/g, " ")
    .trim();
  if (q.length < 2 || NOT_A_FILM.has(q.toLowerCase())) return null;
  return q;
}

// Largest usable thumbnail on a Telegram document, or null.
//
// Must return an actual PhotoSize object, never an index. gramjs resolves a
// numeric `thumb` as `correctThumbs[n]`, and when that misses it silently
// falls back to `fileSize: doc.size` — i.e. it downloads the whole video.
// Passing the object back means a miss here can only mean "no thumbnail".
// PhotoPathSize (type "j") is an SVG outline, not an image; gramjs drops it.
export function bestThumb(doc) {
  const usable = (doc?.thumbs || []).filter((t) => typeof t?.type === "string" && t.type !== "j");
  if (!usable.length) return null;
  const bytes = (t) => t.size ?? (t.sizes ? Math.max(...t.sizes) : t.bytes?.length ?? 0);
  return usable.reduce((a, b) => (bytes(b) > bytes(a) ? b : a));
}

/**
 * Turn a fetched manifest into the shape the UI wants, or null if it isn't
 * usable. Separate from the fetch so the decision rules can be tested without
 * a network: a malformed manifest must read as "no information", never as
 * "you're up to date" (which would hide real updates) and never as an update
 * to some NaN version.
 */
export function parseManifest(v, currentCode) {
  if (!v || typeof v !== "object") return null;
  // Number("") is 0 and Number(null) is 0, so check for emptiness explicitly
  // rather than letting a blank field become version zero.
  const raw = v.versionCode;
  if (raw === null || raw === undefined || raw === "") return null;
  const latestCode = Number(raw);
  if (!Number.isFinite(latestCode)) return null;
  return {
    latestCode,
    latestName: String(v.versionName || latestCode),
    notes: String(v.notes || ""),
    downloaderCode: String(v.downloaderCode || ""),
    // Compare versionCode, not the display name: it's the monotonic integer
    // Android itself uses to decide an upgrade is an upgrade, and it needs no
    // version-string parsing to get right.
    updateAvailable: latestCode > currentCode,
  };
}

export const TYPE_META = {
  file:   { label: "Telegram File", short: "FILE" },
  stream: { label: "Direct Stream", short: "STREAM" },
  magnet: { label: "Magnet Link",   short: "MAGNET" },
  yt:     { label: "YouTube Link",  short: "YT" },
};
