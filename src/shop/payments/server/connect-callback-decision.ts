// Pure helpers extracted from connect-callback.ts's OAuth-callback handler —
// state matching, the post-token-exchange metadata patch, and the redirect
// URL builder. The actual token exchange / encryption / DB write stay in the
// handler (real I/O); these are the parts safe to unit test without a DB.

export type PendingProviderRow = {
  id: string;
  shop_id: string;
  metadata: unknown;
};

/** Find the `pending` provider row whose stashed oauth_state matches Mollie's callback. */
export function findPendingProviderByState<T extends PendingProviderRow>(
  rows: T[],
  state: string,
): T | null {
  return (
    rows.find((r) => {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      return meta.oauth_state === state;
    }) ?? null
  );
}

/** `expires_in` (seconds, from Mollie's token response) → absolute ISO timestamp. */
export function tokenExpiresAtIso(expiresInSeconds: number | undefined, nowMs: number): string | null {
  return expiresInSeconds ? new Date(nowMs + expiresInSeconds * 1000).toISOString() : null;
}

export type BuildConnectedMetadataInput = {
  existingMeta: Record<string, unknown>;
  accessTokenEnc: string | null;
  refreshTokenEnc: string | null;
  expiresAt: string | null;
  organizationId: string | null;
  organizationName: string | null;
  profileId: string | null;
  scope: string | null;
};

/**
 * The full metadata patch written after a successful token exchange —
 * encrypted tokens in, any legacy plaintext fields stripped, oauth_state
 * cleared, and connection_confirmed reset to false (forces the "is this the
 * right Mollie business?" confirmation step in the UI).
 */
export function buildConnectedProviderMetadata(
  input: BuildConnectedMetadataInput,
): Record<string, unknown> {
  return {
    ...input.existingMeta,
    access_token_enc: input.accessTokenEnc,
    refresh_token_enc: input.refreshTokenEnc,
    access_token: null,
    refresh_token: null,
    token_expires_at: input.expiresAt,
    organization_id: input.organizationId,
    organization_name: input.organizationName,
    profile_id: input.profileId,
    scopes: input.scope,
    oauth_state: null,
    oauth_state_created_at: null,
    oauth_error: null,
    last_refresh_at: null,
    last_refresh_error: null,
    connection_confirmed: false,
    confirmed_at: null,
  };
}

/** Metadata patch written when something after token exchange fails (encryption, org fetch, etc). */
export function buildProviderErrorMetadata(
  existingMeta: Record<string, unknown>,
  errorMessage: string,
): Record<string, unknown> {
  return { ...existingMeta, oauth_error: errorMessage, oauth_state: null };
}

/** /shop/payments?mollie_connect=ok|error[&reason=...] */
export function buildCallbackRedirectUrl(
  origin: string,
  status: "ok" | "error",
  reason?: string,
): string {
  const u = new URL("/shop/payments", origin);
  u.searchParams.set("mollie_connect", status);
  if (reason) u.searchParams.set("reason", reason);
  return u.toString();
}
