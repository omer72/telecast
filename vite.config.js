import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// The version that matters is the one stamped into the APK, so read it from
// build.gradle rather than keeping a second copy that drifts. package.json is
// still 0.0.0 and is not the source of truth.
const gradle = readFileSync("android/app/build.gradle", "utf8");
const versionName = gradle.match(/versionName\s+"([^"]+)"/)?.[1] || "dev";
const versionCode = gradle.match(/versionCode\s+(\d+)/)?.[1] || "0";

// gramjs (the `telegram` package) depends on Node primitives (Buffer, process,
// stream). Polyfill them so it runs inside the browser / Capacitor WebView.
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // gramjs reaches into a fair pile of Node primitives. Polyfill them all
      // — `os` in particular is what trips with "c.default.type is not a
      // function" when missing.
      include: [
        "buffer", "process", "stream", "events", "util", "crypto",
        "path", "os", "url", "querystring", "assert", "string_decoder",
        "constants", "vm",
      ],
      globals: { Buffer: true, process: true, global: true },
    }),
  ],
  define: {
    // Some gramjs internals key off this
    global: "globalThis",
    // Injected into import.meta.env rather than a bare global so it needs no
    // eslint globals entry and reads like the other VITE_ vars.
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(versionName),
    "import.meta.env.VITE_APP_BUILD": JSON.stringify(versionCode),
  },
});
