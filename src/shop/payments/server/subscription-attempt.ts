// Pure classification logic for a platform subscription payment attempt, extracted from
// mollie-webhook.ts so the branching that decides whether a failed/canceled Mollie status
// should touch shop.subscription_status is testable without mocking Supabase/Mollie.
//
// Context: Mollie's `canceled`/`expired` on a FIRST payment, or any failed/canceled/expired
// UPGRADE checkout, must NOT mark the shop payment_failed (the shop may already have an
// active Starter/Pro plan). Only recurring charge failures flip shop status.

export type SubscriptionAttemptKind =
  | "subscription_first"
  | "subscription"
  | "subscription_upgrade"
  | "subscription_recurring"
  | string
  | null
  | undefined;

/** First-checkout attempt that the shop owner abandoned/canceled — not a real failure. */
export function isAbandonedFirstAttempt(
  rawMollieStatus: string | null | undefined,
  kind: SubscriptionAttemptKind,
): boolean {
  return (
    (rawMollieStatus === "canceled" || rawMollieStatus === "expired") &&
    (kind === "subscription_first" || kind === "subscription")
  );
}

/** An upgrade checkout (from an already-active paid plan) that failed or was abandoned. */
export function isFailedUpgradeCheckout(
  kind: SubscriptionAttemptKind,
  effectiveStatus: string,
): boolean {
  return kind === "subscription_upgrade" && effectiveStatus === "failed";
}

/** Whether a successful payment of this kind should (re)sync the Mollie subscription object. */
export function needsSubscriptionSync(opts: {
  hasMollie: boolean;
  hasCustomerId: boolean;
  kind: SubscriptionAttemptKind;
}): boolean {
  return (
    opts.hasMollie &&
    opts.hasCustomerId &&
    (opts.kind === "subscription_first" ||
      opts.kind === "subscription" ||
      opts.kind === "subscription_upgrade")
  );
}
