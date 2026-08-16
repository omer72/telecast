import { useEffect, useState } from "react";
import { previewArt } from "./api.js";

/**
 * Real preview image for a card if one can be resolved, gradient until then.
 * Lives in its own file so components.jsx keeps exporting only components
 * (react-refresh/only-export-components).
 *
 * Tolerates a null movie so callers can hook in above an early return.
 */
export function useArt(movie) {
  const [art, setArt] = useState(null);
  useEffect(() => {
    if (!movie) return;
    let alive = true;
    Promise.resolve(previewArt(movie)).then((a) => alive && setArt(a));
    return () => { alive = false; };
  }, [movie?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return art || movie?.art;
}
