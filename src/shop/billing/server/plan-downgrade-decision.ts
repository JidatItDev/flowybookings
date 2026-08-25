// Pure decision helpers for plan-downgrade.ts / plan-downgrade-cancel.ts,
// extracted for testability.

const PLAN_RANK: Record<string, number> = { trial: 0, starter: 1, pro: 2, premium: 3 };

export type PlanChangeDirection = "immediate" | "deferred" | "noop";

/**
 * Classifies any plan/cycle change request. Anything that increases what the
 * shop is committing to (a higher tier, or switching to yearly on the same
 * tier) is immediate and charged in full now, going through the normal
 * checkout flow like any other upgrade. Anything that decreases it (a lower
 * tier, or switching to monthly on the same tier) is deferred to the end of
 * the period already paid for, going through the downgrade-scheduling flow.
 * Same plan + same cycle is a no-op.
 */
export function resolvePlanChangeDirection(
  current: { plan: string; cycle: string | null | undefined },
  target: { plan: string; cycle: string },
): PlanChangeDirection {
  const currentRank = PLAN_RANK[current.plan] ?? 0;
  const targetRank = PLAN_RANK[target.plan] ?? 0;
  if (targetRank > currentRank) return "immediate";
  if (targetRank < currentRank) return "deferred";
  const currentCycle = current.cycle === "yearly" ? "yearly" : "monthly";
  if (currentCycle === target.cycle) return "noop";
  return target.cycle === "yearly" ? "immediate" : "deferred";
}

export type DowngradeCancelPreflight = "ok" | "no_pending_downgrade";

/** Whether a shop has a scheduled downgrade that can be cancelled. */
export function resolveDowngradeCancelPreflight(shop: {
  pending_plan: string | null | undefined;
}): DowngradeCancelPreflight {
  return shop.pending_plan ? "ok" : "no_pending_downgrade";
}
