// Extra admin queries (kept separate to avoid touching admin-queries.ts).
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PLATFORM_PROVIDER, BILLING_ENTITY } from "@/admin/settings/platform-billing";

/* ─── Platform subscription billing rollup (one row per shop) ─── */

export type AdminBillingRow = {
  shop_id: string;
  shop_name: string;
  shop_status: string;
  plan: string;
  plan_expires_at: string | null;
  plan_billing_cycle: string | null;
  owner_email: string | null;
  last_payment_status: string | null;
  last_payment_at: string | null;
  total_paid_cents: number;
  payment_count: number;
};

export const adminBillingQuery = () =>
  queryOptions({
    queryKey: ["admin", "billing"],
    queryFn: async (): Promise<AdminBillingRow[]> => {
      const [shopsRes, paymentsRes] = await Promise.all([
        supabase
          .from("shops")
          .select("id, name, status, plan, plan_expires_at, plan_billing_cycle, owner_id")
          .order("created_at", { ascending: false }),
        supabase
          .from("payments")
          .select("shop_id, status, amount_cents, created_at, metadata")
          .eq("provider", PLATFORM_PROVIDER)
          .is("booking_id", null)
          .order("created_at", { ascending: false }),
      ]);
      if (shopsRes.error) throw shopsRes.error;
      const shops = shopsRes.data ?? [];
      const ownerIds = [...new Set(shops.map((s) => s.owner_id))];
      const { data: owners } = await supabase.from("profiles").select("id, email").in("id", ownerIds);
      const ownerMap = new Map((owners ?? []).map((o) => [o.id, o.email]));

      const byShop = new Map<
        string,
        { last?: { status: string; created_at: string }; total: number; count: number }
      >();
      (paymentsRes.data ?? []).forEach((p) => {
        const cur = byShop.get(p.shop_id) ?? { total: 0, count: 0 };
        if (!cur.last) cur.last = { status: p.status, created_at: p.created_at };
        if (p.status === "paid") cur.total += p.amount_cents;
        cur.count += 1;
        byShop.set(p.shop_id, cur);
      });

      return shops.map((s) => {
        const stats = byShop.get(s.id);
        return {
          shop_id: s.id,
          shop_name: s.name,
          shop_status: s.status,
          plan: s.plan,
          plan_expires_at: s.plan_expires_at,
          plan_billing_cycle: s.plan_billing_cycle,
          owner_email: ownerMap.get(s.owner_id) ?? null,
          last_payment_status: stats?.last?.status ?? null,
          last_payment_at: stats?.last?.created_at ?? null,
          total_paid_cents: stats?.total ?? 0,
          payment_count: stats?.count ?? 0,
        };
      });
    },
    staleTime: 15_000,
  });

/* ─── Platform billing audit log (subset of activity_log) ─── */

export type BillingLogRow = {
  id: string;
  shop_id: string | null;
  shop_name?: string;
  actor_email: string | null;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export const adminBillingLogQuery = () =>
  queryOptions({
    queryKey: ["admin", "billing-log"],
    queryFn: async (): Promise<BillingLogRow[]> => {
      const { data, error } = await supabase
        .from("activity_log")
        .select("id, shop_id, actor_email, action, metadata, created_at")
        .eq("entity", BILLING_ENTITY)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const rows = (data ?? []) as BillingLogRow[];
      const shopIds = [...new Set(rows.map((r) => r.shop_id).filter(Boolean) as string[])];
      if (shopIds.length === 0) return rows;
      const { data: shops } = await supabase.from("shops").select("id, name").in("id", shopIds);
      const map = new Map((shops ?? []).map((s) => [s.id, s.name]));
      return rows.map((r) => ({ ...r, shop_name: r.shop_id ? map.get(r.shop_id) : undefined }));
    },
    staleTime: 15_000,
  });

export type ActivityLogRow = {
  id: string;
  shop_id: string | null;
  actor_user_id: string | null;
  actor_email: string | null;
  action: string;
  entity: string;
  metadata: Record<string, unknown>;
  created_at: string;
  shop_name?: string;
};

export const adminActivityLogQuery = () =>
  queryOptions({
    queryKey: ["admin", "activity_log"],
    queryFn: async (): Promise<ActivityLogRow[]> => {
      const { data, error } = await supabase
        .from("activity_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const rows = (data ?? []) as ActivityLogRow[];
      const shopIds = [...new Set(rows.map((r) => r.shop_id).filter(Boolean) as string[])];
      if (shopIds.length === 0) return rows;
      const { data: shops } = await supabase.from("shops").select("id, name").in("id", shopIds);
      const map = new Map((shops ?? []).map((s) => [s.id, s.name]));
      return rows.map((r) => ({ ...r, shop_name: r.shop_id ? map.get(r.shop_id) : undefined }));
    },
    staleTime: 15_000,
  });
