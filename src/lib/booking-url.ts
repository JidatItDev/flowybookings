// Central helper for public booking links.
//
// Canonical path: {APP_URL}/book/<slug>
//
// Resolution order for getPublicAppUrl():
//   1. import.meta.env.VITE_APP_URL (inlined by Vite — works client + SSR)
//   2. process.env.APP_URL (server routes / webhooks)
//   3. window.location.origin (browser, when env unset)
//   No hardcoded port fallback — set VITE_APP_URL + APP_URL in .env per environment.

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function readEnvAppUrl(): string | null {
  // Vite inlines VITE_* at build/dev time — check this first so SSR matches the client bundle.
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_APP_URL?.trim()) {
    return stripTrailingSlash(import.meta.env.VITE_APP_URL.trim());
  }
  if (typeof process !== "undefined" && process.env?.APP_URL?.trim()) {
    return stripTrailingSlash(process.env.APP_URL.trim());
  }
  return null;
}

/** Returns the env-configured public app origin (no trailing slash). */
export function getPublicAppUrl(): string {
  const fromEnv = readEnvAppUrl();
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "";
}

export type GetBookingUrlOptions = {
  /** When true (default for share/copy/QR/email), always use getPublicAppUrl(). */
  external?: boolean;
};

/**
 * Public booking URL for a shop by slug.
 *
 * @param slug  Shop slug (e.g. "inkwell-demo").
 * @param options.external  true = env/browser origin; false = same as external (kept for API compat).
 */
export function getBookingUrl(
  slug: string | null | undefined,
  options: GetBookingUrlOptions | boolean = { external: true },
): string {
  const opts: GetBookingUrlOptions = typeof options === "boolean" ? { external: options } : options;
  const external = opts.external !== false;
  const safe = (slug ?? "").trim();
  const base = external ? getPublicAppUrl() : getPublicAppUrl();
  if (!base) {
    return safe ? `/book/${safe}` : "/book";
  }
  return safe ? `${base}/book/${safe}` : `${base}/book`;
}

/** Display form without protocol, e.g. "localhost:8080/book/inkwell". */
export function getBookingUrlDisplay(slug: string | null | undefined): string {
  return getBookingUrl(slug, { external: true })
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "");
}

/** OG image URL for a shop ref (UUID or slug). */
export function getBookingOgImageUrl(shopRef?: string | null): string {
  const base = getPublicAppUrl();
  if (!shopRef?.trim()) return base ? `${base}/api/og/book` : "/api/og/book";
  const qs = `shop=${encodeURIComponent(shopRef.trim())}`;
  return base ? `${base}/api/og/book?${qs}` : `/api/og/book?${qs}`;
}
