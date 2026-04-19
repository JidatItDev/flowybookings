// Platform subscription billing — shared helpers used by both UI and server routes.
// This is SEPARATE from shop_payment_providers (Mollie Connect for booking payments).
//
// Storage model — no new tables:
//   - subscription payments live in `payments` with provider = 'platform_mollie' and booking_id = NULL
//   - the active plan + expiry live on `shops.plan` / `shops.plan_expires_at` / `shops.plan_billing_cycle`
//   - billing changes are written to `activity_log` with entity = 'platform_billing'

import type { DbPlan } from "@/lib/plans";

export const PLATFORM_PROVIDER = "platform_mollie" as const;
export const BILLING_ENTITY = "platform_billing" as const;

export type BillingCycle = "monthly" | "yearly" | "lifetime";

/** Monthly price in EUR cents per plan. Yearly = 10× monthly (2 months free). */
export const PLAN_PRICE_CENTS: Record<Exclude<DbPlan, "trial">, number> = {
  starter: 1900,
  pro: 4900,
  premium: 9900,
};

export function priceFor(plan: Exclude<DbPlan, "trial">, cycle: BillingCycle): number {
  const monthly = PLAN_PRICE_CENTS[plan];
  if (cycle === "yearly") return monthly * 10;
  if (cycle === "lifetime") return monthly * 24; // not exposed yet; placeholder
  return monthly;
}

/** Compute the next expiry timestamp from `from` for a given cycle. */
export function nextExpiry(from: Date, cycle: BillingCycle): Date {
  const d = new Date(from);
  if (cycle === "yearly") {
    d.setFullYear(d.getFullYear() + 1);
  } else if (cycle === "lifetime") {
    d.setFullYear(d.getFullYear() + 100);
  } else {
    d.setMonth(d.getMonth() + 1);
  }
  return d;
}

/** Pretty label for billing cycle. */
export function cycleLabel(cycle: BillingCycle | string | null | undefined): string {
  if (cycle === "yearly") return "Yearly";
  if (cycle === "lifetime") return "Lifetime";
  return "Monthly";
}
