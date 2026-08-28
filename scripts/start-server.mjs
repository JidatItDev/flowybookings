// Render start entry.
//
// Equivalent to `srvx dist/server/server.js --static ../client --prod`, but
// without srvx CLI's built-in per-request access log (every GET was drowning
// out this app's structured JSON logs — billing/mollie/webhook lines — in the
// Render log stream). Static assets are still served from dist/client.
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { serve } from "srvx";
import { serveStatic } from "srvx/static";
import server from "../dist/server/server.js";

const staticDir = resolve(dirname(fileURLToPath(import.meta.url)), "../dist/client");

serve({
  fetch: server.fetch,
  gracefulShutdown: true,
  middleware: [serveStatic({ dir: staticDir })],
});
