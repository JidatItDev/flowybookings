// Platform subscription billing — shared helpers used by both UI and server routes.
// This is SEPARATE from shop_payment_providers (Mollie Connect for booking payments).
//
// Storage model — no new tables:
//   - subscription payments live in `payments` with provider = 'platform_mollie' and booking_id = NULL
//   - the active plan + expiry live on `shops.plan` / `shops.plan_expires_at` / `shops.plan_billing_cycle`
//   - billing changes are written to `activity_log` with entity = 'platform_billing'

import type { DbPlan } from "@/shared/lib/plans";

export const PLATFORM_PROVIDER = "platform_mollie" as const;
export const BILLING_ENTITY = "platform_billing" as const;

export type BillingCycle = "monthly" | "yearly" | "lifetime";

/** Monthly price in EUR cents per plan. Yearly = 10× monthly (2 months free). */
export const PLAN_PRICE_CENTS: Record<Exclude<DbPlan, "trial">, number> = {
  starter: 1900,
  pro: 4900,
  premium: 9900,
};

/**
 * Monthly price in cents for a plan/cycle, given whatever `plan_pricing.monthly_price_cents`
 * the caller already fetched (or didn't). Any real number from the DB — including 0, e.g. a
 * promo — is used as-is; only a missing/non-number value falls back to PLAN_PRICE_CENTS.
 * Pure by design so it needs no mocking to test; the DB fetch itself lives server-side in
 * shop/billing/server/plan-price.ts (this file is imported by client components too).
 */
export function resolvePlanPriceCents(
  plan: Exclude<DbPlan, "trial">,
  cycle: BillingCycle,
  dbMonthlyPriceCents: number | null | undefined,
): number {
  const monthly = typeof dbMonthlyPriceCents === "number" ? dbMonthlyPriceCents : PLAN_PRICE_CENTS[plan];
  if (cycle === "yearly") return monthly * 10;
  if (cycle === "lifetime") return monthly * 24; // not exposed yet; placeholder
  return monthly;
}

/** Hardcoded-only price (no DB lookup) — kept for client-side estimates before plan_pricing loads. */
export function priceFor(plan: Exclude<DbPlan, "trial">, cycle: BillingCycle): number {
  return resolvePlanPriceCents(plan, cycle, undefined);
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
