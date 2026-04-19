// Revenue + customers queries for the platform admin panel.
// All run with super_admin RLS (browser client).

import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PLATFORM_PROVIDER } from "@/lib/platform-billing";

/* ─── Per-shop revenue rollup ─── */

export type AdminShopRevenueRow = {
  shop_id: string;
  shop_name: string;
  plan: string;
  status: string;
  // This calendar month
  subscription_revenue_month: number;
  fee_revenue_month: number;
  // Lifetime
  subscription_revenue_total: number;
  fee_revenue_total: number;
  booking_payment_count: number;
};

/* ─── Monthly bucket ─── */

export type RevenueMonth = {
  key: string;            // YYYY-MM
  label: string;          // "Jan 25"
  subscription_cents: number;
  fee_cents: number;
};

const MONTH_LABELS = ["Jan", "Feb", "Mrt", "Apr", "Mei", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];

function monthKey(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export type AdminRevenueData = {
  // Stat cards
  subscription_month_cents: number;
  fee_month_cents: number;
  total_month_cents: number;
  mrr_cents: number;                         // sum of monthly price equivalents of paid subs in current month
  avg_fee_per_txn_cents: number;
  lifetime_total_cents: number;
  // Charts
  monthly: RevenueMonth[];                   // last 12 months
  plan_distribution: { plan: string; count: number; revenue_cents: number }[];
  // Per-shop table
  per_shop: AdminShopRevenueRow[];
};

export const adminRevenueQuery = () =>
  queryOptions({
    queryKey: ["admin", "revenue"],
    staleTime: 30_000,
    queryFn: async (): Promise<AdminRevenueData> => {
      const [shopsRes, paymentsRes] = await Promise.all([
        supabase.from("shops").select("id, name, plan, status"),
        supabase
          .from("payments")
          .select("shop_id, amount_cents, application_fee_cents, status, provider, booking_id, created_at"),
      ]);
      if (shopsRes.error) throw shopsRes.error;
      if (paymentsRes.error) throw paymentsRes.error;

      const shops = shopsRes.data ?? [];
      const payments = paymentsRes.data ?? [];

      const shopMap = new Map(shops.map((s) => [s.id, s]));
      const now = new Date();
      const curKey = monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));

      // 12-month buckets
      const monthly: RevenueMonth[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
        monthly.push({
          key: monthKey(d),
          label: `${MONTH_LABELS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`,
          subscription_cents: 0,
          fee_cents: 0,
        });
      }
      const idx = new Map(monthly.map((m, i) => [m.key, i]));

      // Per-shop accumulators
      const perShop = new Map<string, AdminShopRevenueRow>();
      for (const s of shops) {
        perShop.set(s.id, {
          shop_id: s.id,
          shop_name: s.name,
          plan: s.plan,
          status: s.status,
          subscription_revenue_month: 0,
          fee_revenue_month: 0,
          subscription_revenue_total: 0,
          fee_revenue_total: 0,
          booking_payment_count: 0,
        });
      }

      let subscriptionMonthTotal = 0;
      let feeMonthTotal = 0;
      let lifetimeTotal = 0;
      let feeCount = 0;
      let feeSum = 0;

      for (const p of payments) {
        if (p.status !== "paid") continue;
        const k = monthKey(new Date(p.created_at));
        const isSub = p.provider === PLATFORM_PROVIDER && p.booking_id == null;
        const isBookingFee = p.booking_id != null && p.application_fee_cents > 0;
        const inCurMonth = k === curKey;
        const bucketIdx = idx.get(k);
        const row = perShop.get(p.shop_id);

        if (isSub) {
          if (bucketIdx != null) monthly[bucketIdx].subscription_cents += p.amount_cents;
          if (inCurMonth) subscriptionMonthTotal += p.amount_cents;
          lifetimeTotal += p.amount_cents;
          if (row) {
            row.subscription_revenue_total += p.amount_cents;
            if (inCurMonth) row.subscription_revenue_month += p.amount_cents;
          }
        } else if (isBookingFee) {
          if (bucketIdx != null) monthly[bucketIdx].fee_cents += p.application_fee_cents;
          if (inCurMonth) feeMonthTotal += p.application_fee_cents;
          lifetimeTotal += p.application_fee_cents;
          feeCount += 1;
          feeSum += p.application_fee_cents;
          if (row) {
            row.fee_revenue_total += p.application_fee_cents;
            row.booking_payment_count += 1;
            if (inCurMonth) row.fee_revenue_month += p.application_fee_cents;
          }
        }
      }

      // MRR ≈ sum of last paid subscription per shop in current month
      // (approximation: if a shop paid this month, count the latest payment as their monthly rate)
      let mrr = 0;
      const lastByShop = new Map<string, number>();
      for (const p of payments) {
        if (p.status !== "paid" || p.provider !== PLATFORM_PROVIDER || p.booking_id != null) continue;
        if (monthKey(new Date(p.created_at)) !== curKey) continue;
        lastByShop.set(p.shop_id, Math.max(lastByShop.get(p.shop_id) ?? 0, p.amount_cents));
      }
      for (const v of lastByShop.values()) mrr += v;

      // Plan distribution
      const planMap = new Map<string, { count: number; revenue_cents: number }>();
      for (const row of perShop.values()) {
        const cur = planMap.get(row.plan) ?? { count: 0, revenue_cents: 0 };
        cur.count += 1;
        cur.revenue_cents += row.subscription_revenue_total + row.fee_revenue_total;
        planMap.set(row.plan, cur);
      }

      return {
        subscription_month_cents: subscriptionMonthTotal,
        fee_month_cents: feeMonthTotal,
        total_month_cents: subscriptionMonthTotal + feeMonthTotal,
        mrr_cents: mrr,
        avg_fee_per_txn_cents: feeCount === 0 ? 0 : Math.round(feeSum / feeCount),
        lifetime_total_cents: lifetimeTotal,
        monthly,
        plan_distribution: [...planMap.entries()].map(([plan, v]) => ({ plan, ...v })),
        per_shop: [...perShop.values()].sort(
          (a, b) =>
            b.subscription_revenue_total + b.fee_revenue_total -
            (a.subscription_revenue_total + a.fee_revenue_total),
        ),
      };
    },
  });

/* ─── All customers across all shops ─── */

export type AdminCustomerRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  shop_id: string;
  shop_name: string;
  total_spent_cents: number;
  visit_count: number;
  last_visit_at: string | null;
  created_at: string;
};

export const adminAllCustomersQuery = () =>
  queryOptions({
    queryKey: ["admin", "all-customers"],
    staleTime: 30_000,
    queryFn: async (): Promise<AdminCustomerRow[]> => {
      const [customersRes, shopsRes, bookingsRes] = await Promise.all([
        supabase
          .from("customers")
          .select("id, full_name, email, phone, shop_id, total_spent_cents, last_visit_at, created_at")
          .order("created_at", { ascending: false })
          .limit(2000),
        supabase.from("shops").select("id, name"),
        supabase.from("bookings").select("customer_id").not("customer_id", "is", null),
      ]);
      if (customersRes.error) throw customersRes.error;

      const shopMap = new Map((shopsRes.data ?? []).map((s) => [s.id, s.name]));
      const visitMap = new Map<string, number>();
      for (const b of bookingsRes.data ?? []) {
        if (!b.customer_id) continue;
        visitMap.set(b.customer_id, (visitMap.get(b.customer_id) ?? 0) + 1);
      }

      return (customersRes.data ?? []).map((c) => ({
        id: c.id,
        full_name: c.full_name,
        email: c.email,
        phone: c.phone,
        shop_id: c.shop_id,
        shop_name: shopMap.get(c.shop_id) ?? "—",
        total_spent_cents: c.total_spent_cents ?? 0,
        visit_count: visitMap.get(c.id) ?? 0,
        last_visit_at: c.last_visit_at,
        created_at: c.created_at,
      }));
    },
  });

/* ─── CSV helper (no extra dep) ─── */

export function toCsv(rows: Record<string, unknown>[], columns: { key: string; label: string }[]): string {
  const escape = (v: unknown) => {
    if (v == null) return "";
    const s = String(v);
    if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const head = columns.map((c) => escape(c.label)).join(",");
  const body = rows
    .map((r) => columns.map((c) => escape(r[c.key])).join(","))
    .join("\n");
  return `${head}\n${body}`;
}

export function downloadCsv(filename: string, csv: string) {
  if (typeof window === "undefined") return;
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
