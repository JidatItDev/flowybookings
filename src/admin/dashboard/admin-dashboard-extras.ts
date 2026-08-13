// Extra admin-queries voor het dashboard:
//  - Mini 12-maand MRR-serie (compact, voor dashboard-card)
//  - Churn-rate (geannuleerd/verlopen vs. actief)
//  - Live event-feed uit activity_log
//
// Allemaal op de browser-client; super_admin RLS regelt toegang.

import { queryOptions } from "@tanstack/react-query"
import { supabase } from "@/integrations/supabase/client"
import { PLATFORM_PROVIDER } from "@/admin/settings/platform-billing"

const MONTH_LABELS = ["Jan", "Feb", "Mrt", "Apr", "Mei", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"]
const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`

export type AdminDashboardExtras = {
  mrr_series: { label: string; mrr_cents: number }[]
  churn_rate: number // 0..1
  cancelled_or_expired: number
  active_paid: number
}

export const adminDashboardExtrasQuery = () =>
  queryOptions({
    queryKey: ["admin", "dashboard-extras"],
    staleTime: 30_000,
    queryFn: async (): Promise<AdminDashboardExtras> => {
      const [paymentsRes, shopsRes] = await Promise.all([
        supabase
          .from("payments")
          .select("shop_id, amount_cents, status, provider, booking_id, created_at"),
        supabase.from("shops").select("id, plan, status, plan_expires_at, onboarding"),
      ])

      const payments = paymentsRes.data ?? []
      const shops = shopsRes.data ?? []

      // 12-maand MRR-buckets (per maand: som van laatste subscription-betaling per shop)
      const now = new Date()
      const buckets: { label: string; key: string; mrr_cents: number }[] = []
      for (let i = 11; i >= 0; i--) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
        buckets.push({
          key: monthKey(d),
          label: `${MONTH_LABELS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`,
          mrr_cents: 0,
        })
      }
      const idx = new Map(buckets.map((b, i) => [b.key, i]))

      // Per (maand, shop) het hoogste subscription-betaalbedrag
      const perMonthShopMax = new Map<string, Map<string, number>>()
      for (const p of payments) {
        if (p.status !== "paid") continue
        if (p.provider !== PLATFORM_PROVIDER || p.booking_id != null) continue
        const k = monthKey(new Date(p.created_at))
        if (!idx.has(k)) continue
        const inner = perMonthShopMax.get(k) ?? new Map<string, number>()
        inner.set(p.shop_id, Math.max(inner.get(p.shop_id) ?? 0, p.amount_cents))
        perMonthShopMax.set(k, inner)
      }
      for (const [k, inner] of perMonthShopMax) {
        let sum = 0
        for (const v of inner.values()) sum += v
        const i = idx.get(k)
        if (i != null) buckets[i].mrr_cents = sum
      }

      // Churn = gecancelled/verlopen vs. ooit-actief paid
      let cancelled = 0
      let activePaid = 0
      for (const s of shops) {
        const sub = (s.onboarding as Record<string, unknown> | null)?.subscription_status as string | undefined
        const isPaidPlan = s.plan !== "trial"
        const expired =
          isPaidPlan &&
          s.plan_expires_at != null &&
          new Date(s.plan_expires_at).getTime() < Date.now()
        if (sub === "cancelled" || sub === "expired" || expired) cancelled++
        if (isPaidPlan && s.status === "active" && sub !== "cancelled" && sub !== "expired" && !expired) {
          activePaid++
        }
      }
      const denom = cancelled + activePaid
      const churn_rate = denom === 0 ? 0 : cancelled / denom

      return {
        mrr_series: buckets.map((b) => ({ label: b.label, mrr_cents: b.mrr_cents })),
        churn_rate,
        cancelled_or_expired: cancelled,
        active_paid: activePaid,
      }
    },
  })

/* ─── Live event-feed (laatste 50 uit activity_log) ─── */

export type AdminEvent = {
  id: string
  action: string
  entity: string
  shop_id: string | null
  shop_name: string | null
  actor_email: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export const adminEventFeedQuery = () =>
  queryOptions({
    queryKey: ["admin", "event-feed"],
    staleTime: 10_000,
    queryFn: async (): Promise<AdminEvent[]> => {
      const { data, error } = await supabase
        .from("activity_log")
        .select("id, action, entity, shop_id, actor_email, metadata, created_at")
        .order("created_at", { ascending: false })
        .limit(50)
      if (error) throw error

      const shopIds = [...new Set((data ?? []).map((r) => r.shop_id).filter(Boolean))] as string[]
      let shopMap = new Map<string, string>()
      if (shopIds.length) {
        const { data: shops } = await supabase.from("shops").select("id, name").in("id", shopIds)
        shopMap = new Map((shops ?? []).map((s) => [s.id, s.name]))
      }

      return (data ?? []).map((r) => ({
        id: r.id,
        action: r.action,
        entity: r.entity,
        shop_id: r.shop_id,
        shop_name: r.shop_id ? (shopMap.get(r.shop_id) ?? null) : null,
        actor_email: r.actor_email,
        metadata: (r.metadata ?? {}) as Record<string, unknown>,
        created_at: r.created_at,
      }))
    },
  })

/* ─── Admin unread activity (since profile.admin_last_seen_activity_at) ─── */

export const adminUnreadActivityQuery = (userId: string | null) =>
  queryOptions({
    queryKey: ["admin", "unread-activity", userId],
    enabled: !!userId,
    staleTime: 10_000,
    queryFn: async (): Promise<{ count: number; lastSeenAt: string | null }> => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("admin_last_seen_activity_at")
        .eq("id", userId!)
        .maybeSingle()
      const lastSeenAt = profile?.admin_last_seen_activity_at ?? null
      let q = supabase.from("activity_log").select("id", { count: "exact", head: true })
      if (lastSeenAt) q = q.gt("created_at", lastSeenAt)
      const { count } = await q
      return { count: count ?? 0, lastSeenAt }
    },
  })

export async function markAdminActivitySeen(userId: string) {
  await supabase
    .from("profiles")
    .update({ admin_last_seen_activity_at: new Date().toISOString() })
    .eq("id", userId)
}
