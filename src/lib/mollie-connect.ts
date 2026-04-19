// Shared constants/helpers for the Mollie Connect (OAuth) integration that lets
// shops accept booking deposits via their OWN Mollie account, with FlowyBookings
// taking an application fee.
//
// This is SEPARATE from the platform Mollie account (MOLLIE_API_KEY) which is
// used for SaaS subscription billing in /api/billing/plan-checkout.

export const MOLLIE_CONNECT_AUTHORIZE_URL = "https://my.mollie.com/oauth2/authorize";
export const MOLLIE_CONNECT_TOKEN_URL = "https://api.mollie.com/oauth2/tokens";
export const MOLLIE_CONNECT_API_BASE = "https://api.mollie.com/v2";

// Scopes we need: read profile/orgs to identify the connected account, and
// create + read payments + refunds on the shop's behalf.
export const MOLLIE_CONNECT_SCOPES = [
  "organizations.read",
  "profiles.read",
  "payments.read",
  "payments.write",
  "refunds.read",
  "refunds.write",
  "onboarding.read",
].join(" ");

export const APPLICATION_FEE_PERCENT_DEFAULT = 2.0; // overridable per-shop later
export const APPLICATION_FEE_DESCRIPTION = "FlowyBookings platformkosten";

export type MollieConnectMetadata = {
  access_token?: string;
  refresh_token?: string;
  token_expires_at?: string; // ISO
  organization_id?: string;
  organization_name?: string;
  profile_id?: string;
  scopes?: string;
};

/** Compute the application fee for an amount in cents (returns cents, min €0.01 if applicable). */
export function computeApplicationFeeCents(amountCents: number, percent: number): number {
  if (amountCents <= 0 || percent <= 0) return 0;
  const fee = Math.round((amountCents * percent) / 100);
  // Mollie requires the fee to leave at least €0.01 for the merchant.
  return Math.max(1, Math.min(fee, amountCents - 1));
}
