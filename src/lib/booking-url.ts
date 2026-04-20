// Centrale helper voor publieke boekingslinks van een shop.
//
// Productie-URL: https://www.flowybookings.com/book/<slug>
// In de browser gebruiken we window.location.origin zodat preview-links
// (bijv. id-preview--*.lovable.app of een custom domain) ook werken.
// Server-side valt het terug op APP_URL of de canonieke productie-URL.

export const PUBLIC_APP_URL =
  (typeof process !== "undefined" && process.env?.APP_URL) ||
  "https://www.flowybookings.com";

/** Geeft de basis-URL van de app (zonder trailing slash). */
export function getAppOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return PUBLIC_APP_URL;
}

/**
 * Publieke boekings-URL voor een shop op basis van zijn slug.
 *
 * @param slug      De unieke slug van de shop (bv. "inkwell-demo").
 * @param canonical Forceer de canonieke productie-URL (handig voor delen
 *                  via WhatsApp/email vanuit een preview-omgeving).
 */
export function getBookingUrl(slug: string | null | undefined, canonical = false): string {
  const safe = (slug ?? "").trim();
  const base = canonical ? PUBLIC_APP_URL : getAppOrigin();
  return safe ? `${base}/book/${safe}` : `${base}/book`;
}

/** Display-vorm zonder protocol, bv. "flowybookings.com/book/inkwell". */
export function getBookingUrlDisplay(slug: string | null | undefined): string {
  return getBookingUrl(slug, true).replace(/^https?:\/\//, "").replace(/^www\./, "");
}
