/**
 * Subtitle resolution — two paths, tried in order:
 *   1. .srt / .vtt files shared in the same Telegram chat as the video
 *      (matched to the video by filename similarity)
 *   2. OpenSubtitles REST API (requires VITE_OPENSUBTITLES_* env vars)
 *
 * The browser <track> element only understands WebVTT, so SRT content is
 * transformed before being handed back as a Blob URL.
 */
import { CapacitorHttp } from "@capacitor/core";

const OS_KEY  = (import.meta.env.VITE_OPENSUBTITLES_API_KEY  || "").trim();
const OS_USER = (import.meta.env.VITE_OPENSUBTITLES_USERNAME || "").trim();
const OS_PASS = (import.meta.env.VITE_OPENSUBTITLES_PASSWORD || "").trim();
// Languages to fetch, best first. Results are re-sorted into this order, so
// "he,en" means a Hebrew sub wins even when the English one is more popular.
const OS_LANGS = (import.meta.env.VITE_OPENSUBTITLES_LANGS || "he,en")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

export const OS_ENABLED = Boolean(OS_KEY && OS_USER && OS_PASS);

const UA = "Telecast v0.1";
let _osToken = null;
let _osTokenAt = 0;

// ---------- SRT → VTT ----------
export function srtToVtt(srt) {
  // VTT uses '.' as the millisecond separator; SRT uses ','. Also strip the
  // optional UTF-8 BOM if present.
  const clean = srt.replace(/^﻿/, "");
  return "WEBVTT\n\n" + clean.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
}

function vttBlobUrl(srtOrVtt) {
  const isAlreadyVtt = /^\s*WEBVTT/i.test(srtOrVtt);
  const vtt = isAlreadyVtt ? srtOrVtt : srtToVtt(srtOrVtt);
  return URL.createObjectURL(new Blob([vtt], { type: "text/vtt" }));
}

// ---------- in-chat subtitle matching ----------
function normalizeForMatch(name) {
  return (name || "")
    .toLowerCase()
    .replace(/\.(srt|vtt|ass|ssa|mkv|mp4|webm|mov|avi)$/i, "")
    .replace(/[._\-\s]+/g, " ")
    .replace(/\b(1080p|720p|2160p|4k|hdr|x264|x265|h264|h265|hevc|aac|web-?dl|bluray|remux|amzn|nf|hmax)\b/g, "")
    .replace(/\b(eng|english|en|sub|subs|subtitle|subtitles)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function similarityScore(a, b) {
  if (!a || !b) return 0;
  const ta = new Set(a.split(" ").filter(Boolean));
  const tb = new Set(b.split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.max(ta.size, tb.size); // Jaccard-ish
}

/**
 * Pick the best subtitle from a group's catalogue for the given video. Returns
 * the subtitle entry { id, msg, doc, filename } or null.
 */
export function pickInChatSubtitle(videoFilename, candidates) {
  const target = normalizeForMatch(videoFilename);
  let best = null;
  let bestScore = 0;
  for (const c of candidates) {
    const score = similarityScore(target, normalizeForMatch(c.filename));
    if (score > bestScore) { best = c; bestScore = score; }
  }
  // Minimum threshold so we don't pick a totally unrelated sub when the video
  // happens to share one common token (e.g. "the").
  return bestScore >= 0.4 ? best : null;
}

// ---------- OpenSubtitles ----------
async function osLogin() {
  if (_osToken && Date.now() - _osTokenAt < 23 * 3600 * 1000) return _osToken; // OS tokens live ~24h
  const res = await CapacitorHttp.post({
    url: "https://api.opensubtitles.com/api/v1/login",
    headers: {
      "Api-Key": OS_KEY,
      "Content-Type": "application/json",
      "User-Agent": UA,
    },
    data: { username: OS_USER, password: OS_PASS },
  });
  if (res.status !== 200) throw new Error(`OpenSubtitles login ${res.status}: ${JSON.stringify(res.data)}`);
  _osToken = res.data?.token;
  _osTokenAt = Date.now();
  if (!_osToken) throw new Error("OpenSubtitles login returned no token");
  return _osToken;
}

async function osSearch(fields) {
  // The API 301-redirects when query params aren't in alphabetical order, and
  // a redirect drops the Api-Key header — so sort them here and the request
  // lands first try.
  const params = new URLSearchParams(
    Object.entries(fields)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .sort(([a], [b]) => a.localeCompare(b))
  );
  const res = await CapacitorHttp.get({
    url: `https://api.opensubtitles.com/api/v1/subtitles?${params}`,
    headers: { "Api-Key": OS_KEY, "User-Agent": UA },
  });
  if (res.status !== 200) {
    console.warn("OS search status", res.status, res.data);
    return [];
  }
  return res.data?.data || [];
}

async function osDownload(fileId) {
  const token = await osLogin();
  const res = await CapacitorHttp.post({
    url: "https://api.opensubtitles.com/api/v1/download",
    headers: {
      "Api-Key": OS_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": UA,
    },
    data: { file_id: fileId },
  });
  if (res.status !== 200) {
    console.warn("[subs] OpenSubtitles download refused:", res.status);
    return null;
  }
  // An error page comes back as an HTML *string*, and "html".link is
  // String.prototype.link — a truthy function. Insist on a real URL.
  const link = res.data?.link;
  if (typeof link !== "string" || !link.startsWith("http")) {
    console.warn("[subs] OpenSubtitles download returned no link");
    return null;
  }
  const file = await CapacitorHttp.get({ url: link, responseType: "text" });
  return typeof file.data === "string" ? file.data : null;
}

/**
 * High-level: search by title (season/episode when the name looks like a TV
 * release), prefer the languages in OS_LANGS, download the SRT text. Returns
 * null if disabled, no match, or any failure.
 */
export async function tryOpenSubtitles(movie, filename) {
  if (!OS_ENABLED) {
    console.info("[subs] OpenSubtitles disabled — set VITE_OPENSUBTITLES_API_KEY / _USERNAME / _PASSWORD");
    return null;
  }
  try {
    // "Fauda S05E11 1080p x265" → query "fauda", season 5, episode 11.
    // Searching the whole release name finds nothing; the show name does.
    const raw = (filename || movie.title || "").replace(/\.(mkv|mp4|webm|mov|avi)$/i, "").trim();
    const ep = raw.match(/\bS(\d{1,2})[\s._-]?E(\d{1,3})\b/i);
    // Only pass a year the name actually contains — movie.year falls back to
    // the current year, which would filter every real match away.
    const year = ep ? "" : (raw.match(/\b(19|20)\d{2}\b/) || [""])[0];
    const query = raw
      .replace(/\bS\d{1,2}[\s._-]?E\d{1,3}\b.*$/i, "")   // drop everything from SxxExx on
      .replace(/\b(19|20)\d{2}\b/g, "")
      .replace(/\b(1080p|720p|2160p|4k|hdr|x264|x265|h264|h265|hevc|aac|dd5|web-?dl|bluray|remux)\b/gi, "")
      .replace(/[._]+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (!query) return null;

    const search = { query, languages: OS_LANGS.join(","), year,
      season_number: ep ? ep[1].replace(/^0+/, "") : "",
      episode_number: ep ? ep[2].replace(/^0+/, "") : "" };
    const results = await osSearch(search);
    // This whole path fails soft — without a log, "no subtitles" is
    // indistinguishable from "never looked".
    console.info("[subs] OpenSubtitles", search, "→", results.length, "results");
    if (!results.length) return null;

    // Preferred language first, then most-downloaded within that language.
    const rank = (r) => {
      const i = OS_LANGS.indexOf((r.attributes?.language || "").toLowerCase());
      return i < 0 ? OS_LANGS.length : i;
    };
    results.sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (b.attributes?.download_count || 0) - (a.attributes?.download_count || 0)
    );

    for (const r of results) {
      const fileId = r.attributes?.files?.[0]?.file_id;
      if (!fileId) continue;
      const srt = await osDownload(fileId);
      if (srt) {
        const lang = (r.attributes?.language || "??").toLowerCase();
        return {
          url: vttBlobUrl(srt),
          label: `${lang.toUpperCase()} · OpenSubtitles`,
          srclang: lang,
          source: "opensubtitles",
        };
      }
    }
    return null;
  } catch (err) {
    console.warn("OpenSubtitles lookup failed:", err);
    return null;
  }
}

/** Wrap an in-chat SRT/VTT Buffer into a track entry. */
export function trackFromBuffer(buf, filename) {
  const text = typeof buf === "string" ? buf : Buffer.from(buf).toString("utf8");
  return {
    url: vttBlobUrl(text),
    label: filename || "Subtitles · chat",
    srclang: "en",
    source: "chat",
  };
}
