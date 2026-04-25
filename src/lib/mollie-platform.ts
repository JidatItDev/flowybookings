/**
 * Centralized configuration for the platform Mollie account
 * (FlowyBookings' OWN account used for plan billing, SMS top-ups and the
 * platform-billing webhook). Shop-owned Mollie Connect accounts are NOT
 * handled here — see `src/lib/mollie-connect.ts` for those.
 *
 * Why this file exists
 * --------------------
 * To rotate the platform API key safely we must support TWO keys at the
 * same time:
 *   - PRIMARY (`MOLLIE_API_KEY`)        → used for ALL new payments,
 *                                          subscriptions and customers.
 *   - LEGACY  (`MOLLIE_API_KEY_LEGACY`) → optional fallback used only for
 *                                          existing Mollie objects that were
 *                                          created before the rotation
 *                                          (webhooks, refunds on old
 *                                          payments, lookups of pre-rotation
 *                                          subscriptions, …).
 *
 * If `MOLLIE_API_KEY_LEGACY` is unset, behavior is identical to the
 * pre-rotation setup — every call uses the primary key.
 *
 * Mollie objects are tied to the API key that created them, so a fetch
 * with the wrong key returns 401/404. We therefore expose a helper that
 * tries the primary key first and transparently retries with the legacy
 * key for those two status codes only.
 */

export type MollieKeyKind = "primary" | "legacy";

export type MollieKey = {
  key: string;
  kind: MollieKeyKind;
};

/** Primary key used for ALL new payments / subscriptions / customers. */
export function getMolliePrimaryKey(): string | null {
  return process.env.MOLLIE_API_KEY ?? null;
}

/** Optional legacy key — only used to read/cancel pre-rotation objects. */
export function getMollieLegacyKey(): string | null {
  return process.env.MOLLIE_API_KEY_LEGACY ?? null;
}

/** Returns both configured keys in priority order (primary first). */
export function getMolliePlatformKeys(): MollieKey[] {
  const out: MollieKey[] = [];
  const primary = getMolliePrimaryKey();
  if (primary) out.push({ key: primary, kind: "primary" });
  const legacy = getMollieLegacyKey();
  if (legacy && legacy !== primary) out.push({ key: legacy, kind: "legacy" });
  return out;
}

/**
 * Build the Authorization header for a given Mollie API key.
 */
export function mollieAuthHeader(apiKey: string): string {
  return `Bearer ${apiKey}`;
}

/**
 * Fetch helper that targets a known existing Mollie object (payment,
 * subscription, customer) and automatically retries with the legacy key
 * when the primary key returns 401/404 — i.e. the object was created
 * under the previous key.
 *
 * Use this for ALL operations on existing Mollie IDs (webhooks, status
 * lookups, cancellations on pre-rotation subscriptions). Use
 * `getMolliePrimaryKey()` directly when CREATING new objects.
 */
export async function mollieFetchWithFallback(
  url: string,
  init: RequestInit = {},
): Promise<{ response: Response; usedKind: MollieKeyKind } | null> {
  const keys = getMolliePlatformKeys();
  if (keys.length === 0) return null;

  let lastResponse: Response | null = null;
  let lastKind: MollieKeyKind = "primary";

  for (const { key, kind } of keys) {
    const headers = new Headers(init.headers ?? {});
    headers.set("Authorization", mollieAuthHeader(key));
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const response = await fetch(url, { ...init, headers });
    // Only fall back on auth/not-found — those indicate "wrong key for this object".
    if (response.status !== 401 && response.status !== 404) {
      return { response, usedKind: kind };
    }
    lastResponse = response;
    lastKind = kind;
  }

  return lastResponse ? { response: lastResponse, usedKind: lastKind } : null;
}
