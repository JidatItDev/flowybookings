// Live subscription pricing — reads plan_pricing.monthly_price_cents so admin edits
// in the dashboard (PlanConfigurationCard) apply to real Mollie charges, not just the
// displayed price. Falls back to the hardcoded PLAN_PRICE_CENTS map (via
// resolvePlanPriceCents) if the row is missing or the query fails — same shape as
// booking/server/checkout.ts's plan_pricing.booking_fee_cents lookup.
//
// Server-only: platform-billing.ts stays client-safe (no supabaseAdmin import there).

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolvePlanPriceCents, type BillingCycle } from "@/admin/settings/platform-billing";
import type { DbPlan } from "@/shared/lib/plans";
import { createLogger } from "@/server/logger";

const log = createLogger("billing.plan_price");

export async function fetchPlanPriceCents(
  plan: Exclude<DbPlan, "trial">,
  cycle: BillingCycle,
): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("plan_pricing")
    .select("monthly_price_cents")
    .eq("plan_name", plan)
    .maybeSingle();

  if (error) {
    log.warn("plan_pricing_fetch_failed", { plan, error: error.message });
  } else if (!data) {
    log.warn("plan_pricing_row_missing", { plan });
  }

  return resolvePlanPriceCents(plan, cycle, data?.monthly_price_cents);
}
