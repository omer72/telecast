/**
 * Self-check for the OK tap-vs-hold rules. Getting these wrong is not subtle
 * on a TV: a mis-read press either opens a movie you meant to star, or stars
 * one you meant to open.
 * Run: node src/longPress.test.mjs
 */
import assert from "node:assert/strict";
import { createPressTracker, LONG_PRESS_MS } from "./longPress.js";

const LONG = LONG_PRESS_MS;

// --- a tap is a tap -----------------------------------------------------------
{
  const p = createPressTracker();
  assert.equal(p.down(1000, false), null, "keydown alone decides nothing");
  assert.equal(p.up(1100), "short");
}

// --- a hold with key repeats fires once, on the repeat ------------------------
{
  const p = createPressTracker();
  assert.equal(p.down(1000, false), null);
  assert.equal(p.down(1000 + LONG - 1, true), null, "not yet past the threshold");
  assert.equal(p.down(1000 + LONG, true), "long", "fires as soon as it crosses");
  assert.equal(p.down(1000 + LONG + 200, true), null, "later repeats must not re-fire");
  // Release after a hold must do nothing — this is the bug that would open the
  // movie you just starred.
  assert.equal(p.up(1000 + LONG + 400), null);
}

// --- a hold on a remote that sends no repeats still counts --------------------
{
  const p = createPressTracker();
  assert.equal(p.down(5000, false), null);
  assert.equal(p.up(5000 + LONG), "long");
}

// --- exactly at the boundary counts as a hold ---------------------------------
{
  const p = createPressTracker();
  p.down(0, false);
  assert.equal(p.up(LONG), "long");
}
{
  const p = createPressTracker();
  p.down(0, false);
  assert.equal(p.up(LONG - 1), "short");
}

// --- state resets between presses ---------------------------------------------
{
  const p = createPressTracker();
  p.down(0, false);
  assert.equal(p.down(LONG, true), "long");
  assert.equal(p.up(LONG + 10), null);
  // Next press is independent — a previous hold must not leak into it.
  assert.equal(p.down(9000, false), null);
  assert.equal(p.up(9050), "short");
}

// --- a stray keyup with no keydown must not be read as a hold -----------------
// Happens when focus moves to a card while OK is already down.
{
  const p = createPressTracker();
  assert.equal(p.up(999999), "short", "no recorded press start means treat as a tap");
}

console.log("longPress.test.mjs OK");
