// Pure decision logic for Mollie Connect token refresh — used both on-demand
// (getActiveMollieAccessToken, before each Mollie API call) and by the
// /hooks/mollie-refresh-tokens cron (bulk, every 4h).
//
// The two call sites deliberately treat a MISSING/unparseable expiry
// differently, so this is two named predicates rather than one function with
// a boolean flag:
//   - on-demand: optimistic — assume still valid, avoids refreshing on every
//     single request just because a row predates this field being written.
//   - cron: proactive — treat as due, since refreshing is cheap in a
//     background job and this is the only path that will ever fix a row
//     stuck without a known expiry.

/** Before using a stored access token for an API call. */
export function accessTokenNeedsRefresh(
  expiresAtIso: string | null | undefined,
  nowMs: number,
  windowMs: number,
): boolean {
  const expiresMs = expiresAtIso ? Date.parse(expiresAtIso) : NaN;
  return Number.isFinite(expiresMs) && expiresMs - nowMs < windowMs;
}

/** Bulk check for the refresh cron. */
export function cronRowIsDueForRefresh(
  expiresAtIso: string | null | undefined,
  nowMs: number,
  aheadMs: number,
): boolean {
  if (!expiresAtIso) return true;
  const expiresMs = Date.parse(expiresAtIso);
  if (!Number.isFinite(expiresMs)) return true;
  return expiresMs - nowMs < aheadMs;
}

export type MollieConnectProviderRow = {
  id: string;
  metadata: unknown;
};

export type RefreshPlanAction = "refresh" | "skip_no_refresh_token" | "skip_not_due";

export type RefreshPlanItem = {
  id: string;
  action: RefreshPlanAction;
  refreshTokenEnc: string | null;
};

/**
 * Categorize every connected provider row for the refresh cron: which ones
 * actually need a Mollie token-refresh call, and which can be skipped (and why).
 */
export function planTokenRefresh(
  rows: MollieConnectProviderRow[],
  nowMs: number,
  aheadMs: number,
): RefreshPlanItem[] {
  return rows.map((row) => {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const refreshTokenEnc = (meta.refresh_token_enc as string | undefined) ?? null;
    const expiresAt = (meta.token_expires_at as string | undefined) ?? null;

    if (!refreshTokenEnc) {
      return { id: row.id, action: "skip_no_refresh_token", refreshTokenEnc: null };
    }
    if (!cronRowIsDueForRefresh(expiresAt, nowMs, aheadMs)) {
      return { id: row.id, action: "skip_not_due", refreshTokenEnc };
    }
    return { id: row.id, action: "refresh", refreshTokenEnc };
  });
}
