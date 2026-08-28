// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { nitro } from "nitro/vite";

export default defineConfig({
  // Render deploys a plain Node server, not Cloudflare Workers. Keep this
  // false so `vite build` never targets Cloudflare.
  cloudflare: false,
  // TanStack Start's own recommended Node deployment path (produces
  // .output/server/index.mjs with proper static-asset serving/caching built
  // in) instead of the raw dist/server/server.js fetch handler we were
  // hand-wrapping with srvx before.
  plugins: [nitro({ preset: "node-server" })],
  vite: {
    server: {
      allowedHosts: [
        ".ngrok-free.app",
        ".ngrok-free.dev",
        ".ngrok.app",
        ".ngrok.io",
      ],
    },
  },
});
