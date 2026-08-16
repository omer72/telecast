/**
 * Self-check for YouTube id extraction, which decides whether a YT card gets
 * a real thumbnail or silently falls back to a gradient.
 * Run: node src/art.test.mjs
 */
import assert from "node:assert/strict";
import { bestThumb, youtubeId } from "./data.js";

const ID = "dQw4w9WgXcQ";
for (const url of [
  `https://www.youtube.com/watch?v=${ID}`,
  `https://www.youtube.com/watch?list=PL123&v=${ID}&t=42s`,
  `https://youtu.be/${ID}`,
  `https://youtu.be/${ID}?t=42`,
  `https://www.youtube.com/embed/${ID}`,
  `https://www.youtube.com/shorts/${ID}`,
  `look at this https://youtu.be/${ID} lol`,
]) {
  assert.equal(youtubeId(url), ID, `failed on ${url}`);
}

// Ids are exactly 11 chars — a longer run must not be truncated into a match,
// or we'd build a thumbnail URL for a video that doesn't exist.
assert.equal(youtubeId("https://youtu.be/short"), null);
assert.equal(youtubeId("https://example.com/movie.mkv"), null);
assert.equal(youtubeId(""), null);
assert.equal(youtubeId(null), null);
assert.equal(youtubeId(undefined), null);

// --- bestThumb ---------------------------------------------------------------
// Returning anything other than a real thumb object here is expensive: gramjs
// treats an unresolvable `thumb` as "download the whole document", so a bad
// return value downloads a multi-GB video instead of a 20 KB jpeg.

// Largest wins, across the differently-shaped size types.
assert.equal(
  bestThumb({ thumbs: [
    { type: "m", size: 5000 },
    { type: "x", size: 90000 },
    { type: "s", size: 800 },
  ] }).type,
  "x"
);
assert.equal(
  bestThumb({ thumbs: [
    { type: "i", bytes: { length: 200 } },          // PhotoStrippedSize
    { type: "y", sizes: [1000, 40000, 9000] },      // PhotoSizeProgressive
  ] }).type,
  "y"
);

// type "j" is PhotoPathSize — an SVG outline, not an image. gramjs discards it,
// so selecting it would resolve to nothing and trigger the full download.
assert.equal(bestThumb({ thumbs: [{ type: "j", size: 999999 }] }), null);
assert.equal(
  bestThumb({ thumbs: [{ type: "j", size: 999999 }, { type: "m", size: 10 }] }).type,
  "m"
);

// No thumbnail must be null, never an index or a bare document.
assert.equal(bestThumb({ thumbs: [] }), null);
assert.equal(bestThumb({}), null);
assert.equal(bestThumb(null), null);
assert.equal(bestThumb(undefined), null);
assert.equal(bestThumb({ thumbs: [{ size: 100 }] }), null); // no type field

console.log("art.test.mjs OK");
