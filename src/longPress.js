// How long OK must be held to count as a long press rather than a normal one.
export const LONG_PRESS_MS = 600;

/**
 * Tracks one OK press and decides whether it was a tap or a hold.
 *
 * Split out of useFocusGrid so the timing rules are testable without a DOM,
 * and so the whole press lives in one object the hook can park in a ref. That
 * matters: the key handler re-registers on every render, and a long press sets
 * state — plain locals would be wiped mid-press by that very re-render, and
 * releasing OK after a successful hold would also fire the short action.
 *
 * down() and up() return "long", "short", or null for "nothing yet".
 */
export function createPressTracker(thresholdMs = LONG_PRESS_MS) {
  // null, not 0, for "no press recorded": 0 is a real timestamp shortly after
  // load, and a truthiness check would read that press as a tap however long
  // it was held.
  let start = null;
  let fired = false;
  return {
    down(now, repeat) {
      if (!repeat) { start = now; fired = false; return null; }
      // Firing on the auto-repeat rather than waiting for release means the
      // star flips while the button is still down, which is the feedback that
      // tells you the hold worked.
      if (!fired && now - start >= thresholdMs) { fired = true; return "long"; }
      return null;
    },
    up(now) {
      let result = null;
      if (!fired) {
        // The elapsed check is the fallback for remotes that emit no key
        // repeats; without it a hold on those would silently act like a tap.
        result = start !== null && now - start >= thresholdMs ? "long" : "short";
      }
      start = null;
      fired = false;
      return result;
    },
  };
}
