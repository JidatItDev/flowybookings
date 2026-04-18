// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import path from "node:path";

export default defineConfig({
  vite: {
    resolve: {
      alias: {
        // Force a single htmlparser2 + entities copy across the dep tree.
        // html-to-text (used by @react-email/components) breaks SSR when the
        // resolver picks up cheerio's nested htmlparser2 v10 layout
        // (dist/esm/index.js) instead of the hoisted v9 (lib/esm/index.js).
        "htmlparser2/dist/esm/index.js": path.resolve(
          __dirname,
          "node_modules/htmlparser2/lib/esm/index.js",
        ),
        htmlparser2: path.resolve(__dirname, "node_modules/htmlparser2"),
        "entities/lib/decode.js": path.resolve(
          __dirname,
          "node_modules/entities/lib/decode.js",
        ),
        "entities/lib/encode.js": path.resolve(
          __dirname,
          "node_modules/entities/lib/encode.js",
        ),
        entities: path.resolve(__dirname, "node_modules/entities"),
      },
    },
  },
});
