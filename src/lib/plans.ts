// Centralised plan definitions and feature gating for FlowyBookings.
// The DB enum `subscription_plan` is: 'trial' | 'starter' | 'pro' | 'premium'.
// We expose three user-facing tiers: BASIC (= starter), PRO, PREMIUM.
// `trial` is treated as BASIC for gating and shown as "Trial" to admins.

import { supabase } from "@/integrations/supabase/client";

export type DbPlan = "trial" | "starter" | "pro" | "premium";
export type Tier = "basic" | "pro" | "premium";

export const TIER_RANK: Record<Tier, number> = {
  basic: 0,
  pro: 1,
  premium: 2,
};

export function tierOf(plan: DbPlan | string | null | undefined): Tier {
  if (plan === "pro") return "pro";
  if (plan === "premium") return "premium";
  return "basic"; // trial + starter + unknown
}

/** Feature flags. Each flag declares the minimum tier required. */
export const FEATURES = {
  // BASIC
  bookings: "basic",
  customers: "basic",
  services: "basic",
  staffBasic: "basic",
  emailReminders: "basic",
  // PRO
  smsReminders: "pro",
  noShowProtection: "pro",
  advancedAnalytics: "pro",
  customBranding: "pro",
  deposits: "pro",
  // PREMIUM
  whatsappReminders: "premium",
  automation: "premium",
  multiLocation: "premium",
  apiAccess: "premium",
  prioritySupport: "premium",
} as const;

export type Feature = keyof typeof FEATURES;

export function planAllows(plan: DbPlan | string | null | undefined, feature: Feature): boolean {
  return TIER_RANK[tierOf(plan)] >= TIER_RANK[FEATURES[feature]];
}

export function requiredTierFor(feature: Feature): Tier {
  return FEATURES[feature];
}

/** Pretty label for UI. */
export function planLabel(plan: DbPlan | string | null | undefined): string {
  if (plan === "trial") return "Trial";
  if (plan === "pro") return "Pro";
  if (plan === "premium") return "Premium";
  return "Basic";
}

export const ALL_DB_PLANS: DbPlan[] = ["trial", "starter", "pro", "premium"];

/** Write a plan change and an audit-log entry in one go. */
export async function changeShopPlan(opts: {
  shopId: string;
  newPlan: DbPlan;
  previousPlan: DbPlan | string | null;
  actorUserId: string | null;
  actorEmail: string | null;
  source: "admin" | "owner_upgrade";
}) {
  const { shopId, newPlan, previousPlan, actorUserId, actorEmail, source } = opts;
  const { error } = await supabase.from("shops").update({ plan: newPlan }).eq("id", shopId);
  if (error) throw error;
  // Best-effort audit log; never block the UX if it fails.
  try {
    await supabase.from("activity_log").insert({
      shop_id: shopId,
      actor_user_id: actorUserId,
      actor_email: actorEmail,
      action: source === "admin" ? "plan_changed_by_admin" : "plan_upgraded_by_owner",
      entity: "shop",
      metadata: { previous_plan: previousPlan, new_plan: newPlan, source },
    });
  } catch {
    /* ignore */
  }
}
