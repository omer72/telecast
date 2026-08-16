import { useEffect, useState } from "react";
import { previewArt } from "./api.js";

/**
 * Real preview image for a card if one can be resolved, gradient until then.
 * Lives in its own file so components.jsx keeps exporting only components
 * (react-refresh/only-export-components).
 *
 * `shape` is "wide" for 16:9 boxes and "tall" for 2:3 shelf posters — it picks
 * between TMDB's backdrop and poster art so neither gets crop-mangled.
 * Tolerates a null movie so callers can hook in above an early return.
 */
export function useArt(movie, shape = "wide") {
  const [art, setArt] = useState(null);
  useEffect(() => {
    if (!movie) return;
    let alive = true;
    Promise.resolve(previewArt(movie, shape)).then((a) => alive && setArt(a));
    return () => { alive = false; };
  }, [movie?.id, shape]); // eslint-disable-line react-hooks/exhaustive-deps
  return art || movie?.art;
}
