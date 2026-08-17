/**
 * Self-check for the update-manifest rules. The failure modes are quiet ones:
 * a malformed manifest that reads as "up to date" hides real releases, and one
 * that reads as an update sends people after a version that doesn't exist.
 * Run: node src/update.test.mjs
 */
import assert from "node:assert/strict";
import { parseManifest } from "./data.js";

const CURRENT = 8;

// --- the ordinary cases -------------------------------------------------------
{
  const r = parseManifest({ versionCode: 9, versionName: "1.8", notes: "n", downloaderCode: "9070172" }, CURRENT);
  assert.equal(r.updateAvailable, true);
  assert.equal(r.latestName, "1.8");
  assert.equal(r.notes, "n");
  assert.equal(r.downloaderCode, "9070172");
}
assert.equal(parseManifest({ versionCode: 8 }, CURRENT).updateAvailable, false, "same code is not an update");
assert.equal(parseManifest({ versionCode: 7 }, CURRENT).updateAvailable, false, "older code is not an update");

// A published manifest may carry the code as a JSON string.
assert.equal(parseManifest({ versionCode: "9" }, CURRENT).updateAvailable, true);

// --- unusable manifests must be null, never a verdict -------------------------
// Returning a verdict here is the dangerous outcome: {} would become version 0
// via Number(undefined)... which is NaN, but an empty string would become 0 and
// read as "up to date" forever.
for (const bad of [null, undefined, "1.8", 42, [], {}, { versionName: "1.8" },
                   { versionCode: "" }, { versionCode: null }, { versionCode: "soon" }]) {
  assert.equal(parseManifest(bad, CURRENT), null, `should reject ${JSON.stringify(bad)}`);
}

// --- fallbacks ----------------------------------------------------------------
{
  // No display name: fall back to the code rather than rendering "undefined".
  const r = parseManifest({ versionCode: 12 }, CURRENT);
  assert.equal(r.latestName, "12");
  assert.equal(r.notes, "");
  assert.equal(r.downloaderCode, "");
}

// --- the real published manifest is valid ------------------------------------
// Guards against shipping a version.json the app can't read.
import { readFileSync } from "node:fs";
const live = JSON.parse(readFileSync(new URL("../docs/version.json", import.meta.url), "utf8"));
const parsedLive = parseManifest(live, 0);
assert.ok(parsedLive, "docs/version.json must be parseable by the app");
assert.ok(Number.isInteger(parsedLive.latestCode) && parsedLive.latestCode > 0);
assert.match(parsedLive.latestName, /^\d+\.\d+/);

console.log("update.test.mjs OK");
