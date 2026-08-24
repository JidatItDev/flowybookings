// Pure per-shop decision logic for the billing-expiry cron sweep, extracted from
// billing-expiry.ts so the branching around live-Mollie-subscription guards and
// status handling is testable without a fake Supabase client.

export function hasLiveMollieSubscription(mollie_subscription_id: string | null | undefined): boolean {
  return typeof mollie_subscription_id === "string" && mollie_subscription_id.length > 0;
}

/**
 * Should a scheduled downgrade (`pending_plan`) keep the shop marked `active` once applied?
 * Yes if Mollie still has a live subscription for it, or it was already active.
 */
export function resolvePendingPlanKeepActive(shop: {
  mollie_subscription_id: string | null | undefined;
  subscription_status: string | null | undefined;
}): boolean {
  return hasLiveMollieSubscription(shop.mollie_subscription_id) || shop.subscription_status === "active";
}

export type ExpirySweepAction = "skip_live_mollie" | "skip_none" | "expire";

/**
 * What should happen to a shop whose plan_expires_at is in the past.
 *
 * Never expire while Mollie still has a live subscription (e.g. SEPA awaiting
 * collection) or a future next_billing_at — that would cut off a shop that's
 * mid-collection. Otherwise expire regardless of subscription_status, UNLESS it's
 * already "none" (nothing to do).
 *
 * Note: the cancelled/payment_failed/active/expired check below only ever gates the
 * "none" case — any other status value (including "paused", or something unexpected)
 * falls through to "expire" the same as cancelled/payment_failed/active/expired would.
 * This mirrors the exact behavior of the original inline loop; it reads oddly but is
 * intentionally preserved here rather than silently changed.
 */
export function resolveExpirySweepAction(
  shop: {
    mollie_subscription_id: string | null | undefined;
    next_billing_at: string | null | undefined;
    subscription_status: string | null | undefined;
  },
  now: number = Date.now(),
): ExpirySweepAction {
  const nextBilling = shop.next_billing_at ? new Date(shop.next_billing_at).getTime() : 0;
  if (hasLiveMollieSubscription(shop.mollie_subscription_id) || nextBilling > now) {
    return "skip_live_mollie";
  }
  const status = shop.subscription_status;
  if (status !== "cancelled" && status !== "payment_failed" && status !== "active" && status !== "expired") {
    if (status === "none") return "skip_none";
  }
  return "expire";
}
