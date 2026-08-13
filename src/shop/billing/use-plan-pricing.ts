// Single source of truth for plan pricing on the shop side.
// Reads plan_pricing rows from the DB (publicly readable) and exposes
// helpers that convert a plan key into a price label for UI surfaces:
//   - header badge (no price)
//   - "Jouw abonnement" card on /shop/settings
//   - pricing tiles on /shop/upgrade
//
// All UI surfaces use this hook so they cannot drift apart from the DB.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { DbPlan } from "@/shared/lib/plans";

export type PlanPricingRow = {
  plan_name: DbPlan;
  monthly_price_cents: number;
  currency: string;
  platform_fee_bps: number;
  booking_fee_cents: number;
};

export type PlanPricingMap = Record<DbPlan, PlanPricingRow | undefined>;

const planPricingKey = ["plan-pricing"] as const;

async function fetchPlanPricing(): Promise<PlanPricingMap> {
  const { data, error } = await supabase
    .from("plan_pricing")
    .select("plan_name, monthly_price_cents, currency, platform_fee_bps, booking_fee_cents");
  if (error) throw error;
  const map: PlanPricingMap = { trial: undefined, starter: undefined, pro: undefined, premium: undefined };
  for (const row of data ?? []) {
    map[row.plan_name as DbPlan] = row as PlanPricingRow;
  }
  return map;
}

/** Hook — pricing rows for all plans, cached for 5 minutes. */
export function usePlanPricing() {
  return useQuery({
    queryKey: planPricingKey,
    queryFn: fetchPlanPricing,
    staleTime: 5 * 60_000,
  });
}

/** Format helpers — used by header, settings card, upgrade page. */
export function formatPlanPrice(
  pricing: PlanPricingMap | undefined,
  plan: string | null | undefined,
  cycle: "monthly" | "yearly" = "monthly",
  locale = "nl-NL",
): string {
  if (!plan || !pricing) return "";
  const row = pricing[plan as DbPlan];
  if (!row || row.monthly_price_cents <= 0) return "";
  const monthly = row.monthly_price_cents / 100;
  const amount = cycle === "yearly" ? monthly * 10 : monthly;
  const formatted = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: row.currency || "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
  return cycle === "yearly" ? `${formatted}/jaar` : `${formatted}/maand`;
}

/** Convenience: monthly amount in major currency units, or null if unknown / free. */
export function planMonthlyAmount(
  pricing: PlanPricingMap | undefined,
  plan: string | null | undefined,
): number | null {
  if (!plan || !pricing) return null;
  const row = pricing[plan as DbPlan];
  if (!row) return null;
  return row.monthly_price_cents / 100;
}

/** Format the fixed booking fee for a plan, or "Geen boekingsfee" / "" if unknown. */
export function formatBookingFee(
  pricing: PlanPricingMap | undefined,
  plan: string | null | undefined,
  locale = "nl-NL",
): string {
  if (!plan || !pricing) return "";
  const row = pricing[plan as DbPlan];
  if (!row) return "";
  if (!row.booking_fee_cents || row.booking_fee_cents <= 0) {
    return locale.startsWith("en") ? "No booking fee" : "Geen boekingsfee";
  }
  const formatted = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: row.currency || "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(row.booking_fee_cents / 100);
  return locale.startsWith("en") ? `${formatted} per booking` : `${formatted} per boeking`;
}
