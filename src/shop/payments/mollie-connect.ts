// Shared constants/helpers for the Mollie Connect (OAuth) integration that lets
// shops accept booking deposits via their OWN Mollie account, with FlowyBookings
// taking an application fee.
//
// This is SEPARATE from the platform Mollie account (MOLLIE_API_KEY) which is
// used for SaaS subscription billing in /api/billing/plan-checkout.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { accessTokenNeedsRefresh } from "@/shop/payments/server/mollie-token-decision";
import { createLogger } from "@/server/logger";

const log = createLogger("mollie_connect");

export const MOLLIE_CONNECT_AUTHORIZE_URL = "https://my.mollie.com/oauth2/authorize";
export const MOLLIE_CONNECT_TOKEN_URL = "https://api.mollie.com/oauth2/tokens";
export const MOLLIE_CONNECT_API_BASE = "https://api.mollie.com/v2";

export const MOLLIE_CONNECT_SCOPES = [
  "organizations.read",
  "profiles.read",
  "payments.read",
  "payments.write",
  "refunds.read",
  "refunds.write",
  "onboarding.read",
].join(" ");

export const APPLICATION_FEE_DESCRIPTION = "FlowyBookings boekingsfee";

// Mollie hard-caps applicationFee at ~10% / €25 by default; we cap at €2 by
// default so we stay safely within Mollie's "no extra approval" zone for new
// Connect partners. Adjust upward only after Mollie raises the limit per app.
export const APPLICATION_FEE_MAX_CENTS = 200; // €2.00
export const APPLICATION_FEE_MAX_PERCENT = 10; // 10% absolute ceiling

/**
 * Per-plan FIXED booking fee in cents (replaces the old percentage model).
 * - trial   = €0   (geen fee tijdens trial)
 * - starter = €0,50
 * - pro     = €0,30
 * - premium = €0   (geen transactiekosten)
 *
 * Mirrored in DB table `plan_pricing.booking_fee_cents`. Code uses these
 * constants as a safe fallback when the DB row cannot be loaded.
 */
// Re-export from the client-safe module so this file remains the single
// import surface for server code, while client components can import the
// same constants/helper from "@/shared/lib/plan-fees" without pulling in
// supabaseAdmin (server-only).
export {
  PLAN_BOOKING_FEE_CENTS,
  BOOKING_FEE_CENTS_DEFAULT,
  bookingFeeCentsForPlan,
} from "@/shared/lib/plan-fees";

/**
 * @deprecated The percentage-based model has been replaced by a fixed
 * per-booking fee. Kept only for binary compatibility with any in-flight
 * imports. New code MUST use `bookingFeeCentsForPlan`.
 */
export function feePercentForPlan(_plan: string | null | undefined): number {
  return 0;
}

export type MollieConnectMetadata = {
  access_token_enc?: string | null;
  refresh_token_enc?: string | null;
  token_expires_at?: string | null; // ISO
  organization_id?: string | null;
  organization_name?: string | null;
  profile_id?: string | null;
  scopes?: string | null;
};

/**
 * Compute the application fee for a deposit amount in cents.
 * - 0 if percent is 0 (e.g. trial plan).
 * - Otherwise: amount × percent, hard-capped at min(10% of amount, €2.00).
 * - Mollie requires the merchant to keep at least €0.01 of the payment.
 */
/**
 * Resolve the applicationFee in cents for a Mollie payment, given the booking
 * amount and the shop's plan-derived fixed fee. Caps:
 *   - Never exceed the absolute platform ceiling (€2.00)
 *   - Never exceed 10% of the amount (Mollie partner safety zone)
 *   - Always leave the merchant ≥ €0,01
 *   - Returns 0 when the plan fee is 0 → caller MUST omit applicationFee
 *     from the Mollie API request entirely (Mollie min applicationFee = €0,01)
 */
export function resolveApplicationFeeCents(
  amountCents: number,
  bookingFeeCents: number,
): number {
  if (amountCents <= 0 || bookingFeeCents <= 0) return 0;
  const absoluteCap = Math.min(
    APPLICATION_FEE_MAX_CENTS,
    Math.floor((amountCents * APPLICATION_FEE_MAX_PERCENT) / 100),
  );
  const capped = Math.min(bookingFeeCents, absoluteCap);
  return Math.max(0, Math.min(capped, amountCents - 1));
}

/**
 * @deprecated Old percentage-based fee compute. Replaced by
 * `resolveApplicationFeeCents`. Returns 0 so any leftover callers stop
 * charging a fee until they are migrated.
 */
export function computeApplicationFeeCents(_amountCents: number, _percent: number): number {
  return 0;
}

// =====================================================================
// Encryption helpers — wrap the public.encrypt_mollie_token /
// decrypt_mollie_token Postgres functions (SECURITY DEFINER, service-role only).
// =====================================================================

export async function encryptToken(plain: string | null | undefined): Promise<string | null> {
  if (!plain) return null;
  const { data, error } = await supabaseAdmin.rpc("encrypt_mollie_token" as never, {
    plaintext: plain,
  } as never);
  if (error) throw new Error(`encrypt_mollie_token failed: ${error.message}`);
  return (data as string | null) ?? null;
}

export async function decryptToken(cipher: string | null | undefined): Promise<string | null> {
  if (!cipher) return null;
  const { data, error } = await supabaseAdmin.rpc("decrypt_mollie_token" as never, {
    ciphertext: cipher,
  } as never);
  if (error) throw new Error(`decrypt_mollie_token failed: ${error.message}`);
  return (data as string | null) ?? null;
}

// =====================================================================
// Token refresh — exchange refresh_token for a fresh access_token.
// Used both on-demand (before each Mollie API call) and by the cron job.
// =====================================================================

export type RefreshedTokens = {
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  scope: string | null;
};

export async function refreshMollieTokens(refreshToken: string): Promise<RefreshedTokens> {
  const clientId = process.env.MOLLIE_CONNECT_CLIENT_ID;
  const clientSecret = process.env.MOLLIE_CONNECT_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("mollie_connect_not_configured");

  const res = await fetch(MOLLIE_CONNECT_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }).toString(),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`mollie_refresh_failed: ${res.status} ${txt}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? null,
    expires_at: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000).toISOString()
      : null,
    scope: json.scope ?? null,
  };
}

/**
 * Resolve a usable Mollie access token for a shop. Decrypts the stored token,
 * and if it is expired (or expires within the safety window), refreshes it
 * using the refresh_token and persists the new encrypted pair.
 *
 * Returns null when the shop has no Mollie connection or the token cannot be
 * refreshed (caller should treat as "no Mollie connection").
 */
const REFRESH_SAFETY_WINDOW_MS = 5 * 60 * 1000; // refresh if expiring within 5 min

export async function getActiveMollieAccessToken(shopId: string): Promise<{
  accessToken: string;
  profileId: string | null;
  providerId: string;
} | null> {
  const { data: provider } = await supabaseAdmin
    .from("shop_payment_providers")
    .select("id, connection_status, metadata")
    .eq("shop_id", shopId)
    .eq("provider", "mollie")
    .maybeSingle();
  if (!provider || provider.connection_status !== "connected") return null;

  const meta = (provider.metadata ?? {}) as Record<string, unknown>;
  const accessEnc = (meta.access_token_enc as string | null | undefined) ?? null;
  const refreshEnc = (meta.refresh_token_enc as string | null | undefined) ?? null;
  const expiresAt = (meta.token_expires_at as string | null | undefined) ?? null;
  const profileId = (meta.profile_id as string | null | undefined) ?? null;
  if (!accessEnc) return null;

  const needsRefresh = accessTokenNeedsRefresh(expiresAt, Date.now(), REFRESH_SAFETY_WINDOW_MS);

  if (!needsRefresh) {
    const access = await decryptToken(accessEnc);
    if (access) return { accessToken: access, profileId, providerId: provider.id };
  }

  if (!refreshEnc) {
    // No refresh token — try the existing access token even if expired.
    const access = await decryptToken(accessEnc);
    return access ? { accessToken: access, profileId, providerId: provider.id } : null;
  }

  try {
    const refresh = await decryptToken(refreshEnc);
    if (!refresh) return null;
    const fresh = await refreshMollieTokens(refresh);
    const newAccessEnc = await encryptToken(fresh.access_token);
    const newRefreshEnc = fresh.refresh_token
      ? await encryptToken(fresh.refresh_token)
      : refreshEnc;
    await supabaseAdmin
      .from("shop_payment_providers")
      .update({
        metadata: {
          ...meta,
          access_token_enc: newAccessEnc,
          refresh_token_enc: newRefreshEnc,
          token_expires_at: fresh.expires_at,
          scopes: fresh.scope ?? (meta.scopes as string | null) ?? null,
          last_refresh_at: new Date().toISOString(),
          last_refresh_error: null,
        } as never,
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", provider.id);
    return { accessToken: fresh.access_token, profileId, providerId: provider.id };
  } catch (err) {
    log.error("on_demand_refresh_failed", { shop_id: shopId, err });
    await supabaseAdmin
      .from("shop_payment_providers")
      .update({
        metadata: {
          ...meta,
          last_refresh_error: (err as Error).message,
          last_refresh_at: new Date().toISOString(),
        },
      })
      .eq("id", provider.id);
    // Fall back to the (likely expired) access token; the API call will fail
    // gracefully and the cron job will retry the refresh later.
    const access = await decryptToken(accessEnc);
    return access ? { accessToken: access, profileId, providerId: provider.id } : null;
  }
}
