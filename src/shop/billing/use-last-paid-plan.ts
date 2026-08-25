// The plan a lapsed shop actually had before its subscription ended.
//
// shops.plan is NOT reliable for this: billing-expiry.ts's expiry sweep
// always resets it to "starter" regardless of the shop's real prior tier
// (Pro/Premium included — see billing-expiry.ts's `.update({ plan: "starter", ... })`).
// The true prior plan only survives in the payments table's metadata on the
// last successfully paid platform charge, so that's what this reads.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PLATFORM_PROVIDER } from "@/admin/settings/platform-billing";
import type { DbPlan } from "@/shared/lib/plans";

async function fetchLastPaidPlan(shopId: string): Promise<DbPlan | null> {
  const { data, error } = await supabase
    .from("payments")
    .select("metadata")
    .eq("shop_id", shopId)
    .eq("provider", PLATFORM_PROVIDER)
    .is("booking_id", null)
    .eq("status", "paid")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const meta = (data?.metadata ?? {}) as { plan?: string };
  const plan = meta.plan;
  return plan === "starter" || plan === "pro" || plan === "premium" ? plan : null;
}

/** Hook — the plan behind the shop's most recent successful platform payment, or null. */
export function useLastPaidPlan(shopId: string | null) {
  return useQuery({
    queryKey: ["shop", "last-paid-plan", shopId],
    enabled: !!shopId,
    queryFn: () => fetchLastPaidPlan(shopId as string),
    staleTime: 60_000,
  });
}
