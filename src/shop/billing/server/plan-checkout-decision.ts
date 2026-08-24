// Pure decision helper for plan-checkout.ts, extracted for testability.

import type { DbPlan } from "@/shared/lib/plans";

const PLAN_RANK: Record<string, number> = { trial: 0, starter: 1, pro: 2, premium: 3 };

export type CheckoutKind = "subscription_upgrade" | "subscription_first";

/**
 * A checkout is an "upgrade" only when the shop already has an active paid plan
 * (not trial) and the target plan outranks it — first-time subscribes and
 * trial→paid conversions are "subscription_first", not upgrades.
 */
export function resolveCheckoutKind(
  previousPlan: DbPlan | string,
  targetPlan: DbPlan | string,
): CheckoutKind {
  const isUpgrade =
    previousPlan !== "trial" && (PLAN_RANK[targetPlan] ?? 0) > (PLAN_RANK[previousPlan] ?? 0);
  return isUpgrade ? "subscription_upgrade" : "subscription_first";
}
