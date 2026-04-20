// React hook + helpers around the get_shop_feature_access SQL function.
// Returns: { allowed, limit, used, upgrade_plan, current_plan } per (shopId, slug).

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type FeatureSlug =
  | "max_bookings_per_month"
  | "max_staff"
  | "platform_fee_percentage"
  | "email_reminders"
  | "sms_reminders"
  | "whatsapp_reminders"
  | "marketing_emails"
  | "advanced_analytics"
  | "custom_branding"
  | "google_reviews"
  | "waitlist"
  | "multi_location"
  | "white_label"
  | "api_access"
  | "priority_support";

export type FeatureAccess = {
  allowed: boolean;
  limit: number | null;
  used: number;
  upgradePlan: string | null;
  currentPlan: string;
};

export function planLabelFor(plan: string | null | undefined): string {
  if (!plan) return "—";
  if (plan === "trial") return "Trial";
  if (plan === "starter") return "Starter";
  if (plan === "pro") return "Pro";
  if (plan === "premium") return "Premium";
  return plan;
}

/**
 * @deprecated Use formatPlanPrice from @/lib/use-plan-pricing — that hook reads
 * plan_pricing from the DB. This stub keeps existing imports compiling but
 * always returns "" so we never render hardcoded prices anymore.
 */
export function planPriceLabel(_plan: string | null | undefined): string {
  return "";
}

export const featureAccessKeys = {
  all: ["feature-access"] as const,
  one: (shopId: string | null, slug: FeatureSlug) => ["feature-access", shopId, slug] as const,
};

async function fetchFeatureAccess(shopId: string, slug: FeatureSlug): Promise<FeatureAccess> {
  const { data, error } = await supabase.rpc("get_shop_feature_access", {
    _shop_id: shopId,
    _feature_slug: slug,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return { allowed: false, limit: null, used: 0, upgradePlan: null, currentPlan: "trial" };
  }
  return {
    allowed: !!row.allowed,
    limit: row.limit_value ?? null,
    used: Number(row.used ?? 0),
    upgradePlan: row.upgrade_plan ?? null,
    currentPlan: row.current_plan ?? "trial",
  };
}

/** Hook to query a single feature's access status for the active shop. */
export function useFeatureAccess(shopId: string | null, slug: FeatureSlug) {
  return useQuery({
    queryKey: featureAccessKeys.one(shopId, slug),
    queryFn: () => fetchFeatureAccess(shopId as string, slug),
    enabled: !!shopId,
    staleTime: 60_000,
  });
}

/** Returns a percentage 0-100 of limit usage; 0 when no limit. */
export function usagePercentage(access: FeatureAccess | undefined): number {
  if (!access || access.limit == null || access.limit === 0) return 0;
  return Math.min(100, Math.round((access.used / access.limit) * 100));
}
