// Pure helpers that derive billing analytics from existing data shapes.
// No new tables, no duplicate queries — fed by adminBillingQuery + adminPaymentsQuery.

import type { AdminBillingRow } from "@/admin/shared/admin-queries-extra";
import type { AdminPaymentRow } from "@/admin/shared/admin-queries";

export type MonthBucket = { key: string; label: string; revenue: number; count: number };

const MONTH_LABELS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthKey(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Last 12 months bucketed series of platform subscription revenue (paid only). */
export function monthlyRevenueSeries(payments: AdminPaymentRow[]): MonthBucket[] {
  const now = new Date();
  const buckets: MonthBucket[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    buckets.push({
      key: monthKey(d),
      label: `${MONTH_LABELS_EN[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`,
      revenue: 0,
      count: 0,
    });
  }
  const idx = new Map(buckets.map((b, i) => [b.key, i]));
  for (const p of payments) {
    if (p.status !== "paid") continue;
    if (p.provider !== "platform_mollie") continue;
    const k = monthKey(new Date(p.created_at));
    const i = idx.get(k);
    if (i == null) continue;
    buckets[i].revenue += p.amount_cents;
    buckets[i].count += 1;
  }
  return buckets;
}

/** Current vs previous calendar month subscription revenue + delta %. */
export function momRevenue(payments: AdminPaymentRow[]) {
  const now = new Date();
  const cur = monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
  const prev = monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));
  let current = 0;
  let previous = 0;
  for (const p of payments) {
    if (p.status !== "paid" || p.provider !== "platform_mollie") continue;
    const k = monthKey(new Date(p.created_at));
    if (k === cur) current += p.amount_cents;
    else if (k === prev) previous += p.amount_cents;
  }
  const deltaPct = previous === 0 ? (current > 0 ? 100 : 0) : Math.round(((current - previous) / previous) * 100);
  return { current, previous, deltaPct };
}

/** Plan distribution across all shops. */
export function planDistribution(rows: AdminBillingRow[]) {
  const m: Record<string, number> = { trial: 0, starter: 0, pro: 0, premium: 0 };
  for (const r of rows) m[r.plan] = (m[r.plan] ?? 0) + 1;
  return m;
}

/** Trial → paid conversion: shops that ever had a paid subscription payment / trial-started shops. */
export function trialToPaidConversion(rows: AdminBillingRow[]) {
  const total = rows.length || 1;
  const paying = rows.filter((r) => r.payment_count > 0).length;
  return { paying, total: rows.length, pct: Math.round((paying / total) * 100) };
}

/** Failed + pending platform payment counts. */
export function paymentHealth(payments: AdminPaymentRow[]) {
  let failed = 0;
  let pending = 0;
  for (const p of payments) {
    if (p.provider !== "platform_mollie") continue;
    if (p.status === "failed") failed += 1;
    if (p.status === "unpaid") pending += 1;
  }
  return { failed, pending };
}
