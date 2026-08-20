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

/** Feature flags kept only as display fallback. Runtime access uses plan_features via get_shop_feature_access. */
export const FEATURES = {
  // BASIC
  bookings: "basic",
  customers: "basic",
  services: "basic",
  staffBasic: "basic",
  emailReminders: "basic",
  // PRO
  smsReminders: "pro",
  advancedAnalytics: "pro",
  customBranding: "pro",
  // PREMIUM
  whatsappReminders: "premium",
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
  return "Starter";
}

export const ALL_DB_PLANS: DbPlan[] = ["trial", "starter", "pro", "premium"];

/** Admin-only plan change via audited server path. Owners must never call this. */
export async function changeShopPlan(opts: {
  shopId: string;
  newPlan: DbPlan;
  previousPlan: DbPlan | string | null;
  actorUserId: string | null;
  actorEmail: string | null;
  source: "admin" | "owner_upgrade";
  reason?: string;
}) {
  if (opts.source !== "admin") {
    throw new Error("Owner plan writes are forbidden");
  }
  const reason = (opts.reason ?? "").trim() || window.prompt("Reden voor deze planwijziging (verplicht):");
  if (!reason) throw new Error("reason_required");
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not signed in");
  const res = await fetch("/api/admin/billing/plan-override", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      shop_id: opts.shopId,
      new_plan: opts.newPlan,
      reason,
    }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? "plan_override_failed");
  }
}
