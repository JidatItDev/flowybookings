// Pure decision helpers for plan-downgrade.ts, extracted for testability.

import type { BillingCycle } from "@/admin/settings/platform-billing";
import type { DbPlan } from "@/shared/lib/plans";

const PLAN_RANK: Record<string, number> = { trial: 0, starter: 1, pro: 2, premium: 3 };

/** A downgrade must strictly lower the plan tier — same/higher tier is rejected. */
export function isValidDowngrade(currentPlan: DbPlan | string, targetPlan: DbPlan | string): boolean {
  return (PLAN_RANK[targetPlan] ?? 0) < (PLAN_RANK[currentPlan] ?? 0);
}

/** Yearly sticks once set (on the request or the shop's current cycle); otherwise monthly. */
export function resolveDowngradeCycle(
  requestedCycle: string | undefined,
  currentCycle: string | null | undefined,
): BillingCycle {
  return requestedCycle === "yearly" || currentCycle === "yearly" ? "yearly" : "monthly";
}
