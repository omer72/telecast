import { useEffect, useMemo, useRef, useState } from "react";
import { createPressTracker } from "./longPress.js";

export function useFocusGrid(allRows, opts = {}) {
  const { onEnter, onLongEnter, onBack, onEdgeLeft, onEdgeRight, enabled = true, initial = null } = opts;
  // Empty rows are dead space: focus lands on them, nothing is highlighted,
  // and the user has to press the same key twice to get past. Callers build
  // rows from lists that are often empty (no continue-watching, no results),
  // so drop them here rather than at every call site.
  const rows = useMemo(() => allRows.filter((r) => r && r.length), [allRows]);
  const [pos, setPos] = useState(() => {
    if (initial) {
      for (let r = 0; r < rows.length; r++) {
        const c = rows[r].indexOf(initial);
        if (c >= 0) return { r, c };
      }
    }
    return { r: 0, c: 0 };
  });

  useEffect(() => {
    setPos((p) => {
      const r = Math.min(p.r, rows.length - 1);
      const cols = rows[r] || [];
      const c = Math.min(p.c, cols.length - 1);
      const nr = Math.max(0, r);
      const nc = Math.max(0, c);
      if (nr === p.r && nc === p.c) return p;
      return { r: nr, c: nc };
    });
  }, [rows]);

  const focusedId = (rows[pos.r] && rows[pos.r][pos.c]) || null;

  // See longPress.js for why this has to survive re-renders. Initialised
  // eagerly rather than lazily — a `if (!press.current)` check would be
  // touching a ref during render.
  const press = useRef(createPressTracker());

  // Whenever focus changes, scroll the focused element into view in its
  // nearest scroll container. With `block: nearest`, the page only scrolls if
  // the element is actually off-screen — no jitter when moving among items
  // already in view.
  useEffect(() => {
    if (!focusedId) return;
    const el = document.querySelector(`[data-focus-id="${CSS.escape(focusedId)}"]`);
    el?.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [focusedId]);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e) => {
      // Real inputs keep the keys they need — typing, IME composition, caret
      // moves, delete. Vertical D-pad and BACK still belong to the grid,
      // though: on a TV there's no pointer, so that's the only way out of a
      // text field. Blur first so the next keypress reaches the grid.
      const tag = e.target?.tagName;
      const isTextField = tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable;
      if (isTextField) {
        if (e.key !== "ArrowUp" && e.key !== "ArrowDown" && e.key !== "Escape") return;
        e.target.blur();
      }
      const k = e.key;
      if (k === "ArrowRight") {
        // At the right edge, hand off to the neighbouring focus zone (the
        // Library uses this to move sidebar → content) instead of dead-ending.
        if (pos.c >= (rows[pos.r] || []).length - 1 && onEdgeRight) onEdgeRight();
        else setPos((p) => {
          const row = rows[p.r] || [];
          return { r: p.r, c: Math.min(row.length - 1, p.c + 1) };
        });
        e.preventDefault();
      } else if (k === "ArrowLeft") {
        if (pos.c === 0 && onEdgeLeft) onEdgeLeft();
        else setPos((p) => ({ r: p.r, c: Math.max(0, p.c - 1) }));
        e.preventDefault();
      } else if (k === "ArrowDown") {
        setPos((p) => {
          const nr = Math.min(rows.length - 1, p.r + 1);
          const nc = Math.min((rows[nr] || []).length - 1, p.c);
          return { r: nr, c: Math.max(0, nc) };
        });
        e.preventDefault();
      } else if (k === "ArrowUp") {
        setPos((p) => {
          const nr = Math.max(0, p.r - 1);
          const nc = Math.min((rows[nr] || []).length - 1, p.c);
          return { r: nr, c: Math.max(0, nc) };
        });
        e.preventDefault();
      } else if (k === "Enter" || k === " ") {
        if (!focusedId) return;
        // Without a long-press handler, keep firing on keydown exactly as
        // before — the keypad and nav depend on that immediacy.
        if (!onLongEnter) {
          if (onEnter) { onEnter(focusedId); e.preventDefault(); }
          return;
        }
        // With one, the short action has to wait for keyup: firing it on
        // keydown would open the movie before we could tell it was a hold.
        e.preventDefault();
        if (press.current.down(e.timeStamp, e.repeat) === "long") onLongEnter(focusedId);
      } else if (k === "Escape" || k === "Backspace") {
        // Always swallow, even with no onBack: on a root screen the default
        // action is the WebView/browser navigating away (on Android that
        // means quitting the app). Exit is an explicit choice in Settings.
        e.preventDefault();
        onBack?.();
      }
    };
    const onKeyUp = (e) => {
      if (!onLongEnter) return;
      if (e.key !== "Enter" && e.key !== " ") return;
      const what = press.current.up(e.timeStamp);
      if (!focusedId) return;
      if (what === "long") onLongEnter(focusedId);
      else if (what === "short") onEnter?.(focusedId);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [rows, enabled, onEnter, onLongEnter, onBack, onEdgeLeft, onEdgeRight, focusedId, pos]);

  return { focusedId, pos, setPos };
}

export function focusedClass(id, focusedId) {
  return id === focusedId ? "is-focused" : "";
}

export function keyValue(id) {
  if (id === "kbk") return "BKSP";
  if (id === "kok") return "OK";
  if (id && id.startsWith("k")) return id.slice(1);
  return null;
}
