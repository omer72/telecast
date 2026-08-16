/**
 * Wrap an async handler so re-entrant calls are dropped while one is in flight.
 *
 * `inFlight` is a ref-like `{ current: boolean }` rather than React state on
 * purpose: two OK presses in the same tick both read the pre-render state value
 * and both fire, which is how one phone number sent several auth.SendCode
 * requests. A ref updates synchronously, so the second call sees it set.
 *
 * Blocked calls resolve to undefined — callers that care must treat that as
 * "didn't run", not as a failure.
 */
export function guarded(inFlight, setBusy, fn) {
  return async (...args) => {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    setBusy(true);
    try {
      return await fn(...args);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
}
