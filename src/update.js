/**
 * Update check against the version manifest published next to the APK.
 *
 * Deliberately advisory only: it tells you a newer build exists and how to get
 * it. Downloading and installing an APK from inside the app would need
 * REQUEST_INSTALL_PACKAGES and a whole install flow, and the Downloader route
 * already works.
 */

const VERSION_URL = "https://omer72.github.io/telecast/version.json";

// Injected by vite.config.js from android/app/build.gradle — the same values
// stamped into the APK, so this can't disagree with what's installed.
const CURRENT_CODE = Number(import.meta.env.VITE_APP_BUILD || 0);
const CURRENT_NAME = String(import.meta.env.VITE_APP_VERSION || "dev");

export function currentVersion() {
  return { code: CURRENT_CODE, name: CURRENT_NAME };
}

// One check per session; the answer can't change while the app is running.
let _check = null;

/**
 * Resolves to { latestCode, latestName, notes, downloaderCode, updateAvailable }
 * or null if the manifest couldn't be read. Never throws — a TV with no
 * network must still boot into a working app.
 */
export function checkForUpdate() {
  if (_check) return _check;
  _check = (async () => {
    try {
      // Pages serves this with max-age=600, so bust the cache: a release the
      // user was just told about shouldn't take ten minutes to show up.
      const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const v = await res.json();
      const latestCode = Number(v.versionCode);
      if (!Number.isFinite(latestCode)) throw new Error("manifest has no usable versionCode");
      return {
        latestCode,
        latestName: String(v.versionName || latestCode),
        notes: String(v.notes || ""),
        downloaderCode: String(v.downloaderCode || ""),
        // Compare versionCode, not the display name: it's the monotonic
        // integer Android itself uses to decide an upgrade is an upgrade,
        // and it doesn't need string version parsing to get right.
        updateAvailable: latestCode > CURRENT_CODE,
      };
    } catch (err) {
      console.warn("[Telecast] update check failed", err);
      return null;
    }
  })();
  return _check;
}
