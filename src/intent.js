/**
 * Tiny wrapper around the native IntentLauncher Capacitor plugin (see
 * android/app/src/main/java/com/telecast/tv/IntentLauncher.java).
 *
 * On Android, calls into the native plugin to fire an ACTION_VIEW intent.
 * On web (dev server), falls back to window.open so things still kinda work.
 */
import { registerPlugin } from "@capacitor/core";

const native = registerPlugin("IntentLauncher", {
  web: {
    openExternal: async ({ url }) => {
      window.open(url, "_blank");
    },
    isInstalled: async () => ({ installed: false }),
    exitApp: async () => { window.close(); },
    openFile: async () => { throw new Error("File hand-off is Android-only"); },
  },
});

/** Hand a locally downloaded file to an external player via FileProvider. */
export async function openFile({ path, pkg, mime }) {
  return native.openFile({ path, package: pkg, mime });
}

/** Quit the app (Android only — BACK is swallowed, so this is the way out). */
export async function exitApp() {
  return native.exitApp();
}

/** Launch the given URL in an external player. `pkg` optional — omit to show chooser. */
export async function openExternal({ url, pkg, mime }) {
  return native.openExternal({ url, package: pkg, mime });
}

/** True if the package is installed on the device. */
export async function isInstalled(pkg) {
  try {
    const { installed } = await native.isInstalled({ package: pkg });
    return installed;
  } catch {
    return false;
  }
}

// Package IDs for the launchers our UI offers
export const PACKAGES = {
  vlc: "org.videolan.vlc",
  mx: "com.mxtech.videoplayer.ad", // free; pro is .pro
  mxPro: "com.mxtech.videoplayer.pro",
};
