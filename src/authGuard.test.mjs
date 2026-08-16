/**
 * Self-check for the auth re-entry guard. The bug it exists to prevent: pressing
 * OK twice on the phone screen fired auth.SendCode more than once.
 * Run: node src/authGuard.test.mjs
 */
import assert from "node:assert/strict";
import { guarded } from "./authGuard.js";

const defer = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};

// --- concurrent calls: only the first runs -----------------------------------
{
  const inFlight = { current: false };
  const busy = [];
  let calls = 0;
  const gate = defer();

  const run = guarded(inFlight, (b) => busy.push(b), async () => {
    calls++;
    await gate.promise;
    return "sent";
  });

  // Three presses before the first has resolved — the exact reported scenario.
  const a = run();
  const b = run();
  const c = run();

  assert.equal(calls, 1, "only the first press should reach the handler");
  gate.resolve();
  assert.equal(await a, "sent");
  assert.equal(await b, undefined, "blocked calls resolve to undefined");
  assert.equal(await c, undefined);
  assert.deepEqual(busy, [true, false], "busy toggles exactly once per real run");
  assert.equal(inFlight.current, false, "guard must reset when done");
}

// --- sequential calls: each runs ---------------------------------------------
{
  const inFlight = { current: false };
  let calls = 0;
  const run = guarded(inFlight, () => {}, async () => ++calls);
  assert.equal(await run(), 1);
  assert.equal(await run(), 2, "guard must not latch after a completed call");
}

// --- a throwing handler still releases the guard ------------------------------
{
  const inFlight = { current: false };
  const busy = [];
  const run = guarded(inFlight, (b) => busy.push(b), async () => {
    throw new Error("network down");
  });
  await assert.rejects(run(), /network down/);
  assert.equal(inFlight.current, false, "a failed call must not wedge sign-in forever");
  assert.deepEqual(busy, [true, false]);
  // And the next attempt goes through.
  const ok = guarded(inFlight, () => {}, async () => "ok");
  assert.equal(await ok(), "ok");
}

console.log("authGuard.test.mjs OK");
