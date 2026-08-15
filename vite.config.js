import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

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
  },
});
