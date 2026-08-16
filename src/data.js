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

export const TYPE_META = {
  file:   { label: "Telegram File", short: "FILE" },
  stream: { label: "Direct Stream", short: "STREAM" },
  magnet: { label: "Magnet Link",   short: "MAGNET" },
  yt:     { label: "YouTube Link",  short: "YT" },
};
