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

export const TYPE_META = {
  file:   { label: "Telegram File", short: "FILE" },
  stream: { label: "Direct Stream", short: "STREAM" },
  magnet: { label: "Magnet Link",   short: "MAGNET" },
  yt:     { label: "YouTube Link",  short: "YT" },
};
