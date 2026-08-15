/**
 * Self-check for the bits of subtitle resolution that silently return "no
 * subtitles" when they're wrong.  Run: node src/subtitles.test.mjs
 */
import assert from "node:assert/strict";

// --- osSearch param ordering -------------------------------------------------
// The API 301s on unsorted params and the redirect drops the Api-Key header.
const sortedParams = (fields) =>
  new URLSearchParams(
    Object.entries(fields)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .sort(([a], [b]) => a.localeCompare(b))
  ).toString();

assert.equal(
  sortedParams({ query: "fauda", languages: "he,en", year: "", season_number: "5", episode_number: "11" }),
  "episode_number=11&languages=he%2Cen&query=fauda&season_number=5"
);

// --- release-name parsing ----------------------------------------------------
function parse(name) {
  const raw = name.replace(/\.(mkv|mp4|webm|mov|avi)$/i, "").trim();
  const ep = raw.match(/\bS(\d{1,2})[\s._-]?E(\d{1,3})\b/i);
  const year = ep ? "" : (raw.match(/\b(19|20)\d{2}\b/) || [""])[0];
  const query = raw
    .replace(/\bS\d{1,2}[\s._-]?E\d{1,3}\b.*$/i, "")
    .replace(/\b(19|20)\d{2}\b/g, "")
    .replace(/\b(1080p|720p|2160p|4k|hdr|x264|x265|h264|h265|hevc|aac|dd5|web-?dl|bluray|remux)\b/gi, "")
    .replace(/[._]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return { query, year, season: ep ? ep[1].replace(/^0+/, "") : "", episode: ep ? ep[2].replace(/^0+/, "") : "" };
}

assert.deepEqual(parse("Fauda.S05E11.DD5.1.H.265-Sweet-Star.mkv"), {
  query: "Fauda", year: "", season: "5", episode: "11",
});
assert.deepEqual(parse("Maximum Pleasure Guaranteed S01E10 1080p"), {
  query: "Maximum Pleasure Guaranteed", year: "", season: "1", episode: "10",
});
// A film keeps its year; a series must not send one (it filters out every hit).
assert.deepEqual(parse("Dune.Part.Two.2024.2160p.x265.mkv"), {
  query: "Dune Part Two", year: "2024", season: "", episode: "",
});

// --- language preference -----------------------------------------------------
const LANGS = ["he", "en"];
const rank = (r) => {
  const i = LANGS.indexOf(r.language);
  return i < 0 ? LANGS.length : i;
};
const picked = [
  { language: "en", download_count: 504 },
  { language: "he", download_count: 6 },
  { language: "fr", download_count: 9000 },
].sort((a, b) => rank(a) - rank(b) || b.download_count - a.download_count)[0];
assert.equal(picked.language, "he", "preferred language must beat raw popularity");

// --- SRT → VTT ---------------------------------------------------------------
const srtToVtt = (srt) =>
  "WEBVTT\n\n" + srt.replace(/^﻿/, "").replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
assert.equal(
  srtToVtt("1\n00:00:01,500 --> 00:00:03,000\nשלום\n"),
  "WEBVTT\n\n1\n00:00:01.500 --> 00:00:03.000\nשלום\n"
);

console.log("subtitles: all checks passed");
