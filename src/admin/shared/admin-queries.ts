// TanStack Query factories for the super-admin panel.
// All queries use the browser Supabase client (RLS: super_admin sees everything).

import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/* ─── Platform stats (overview) ─── */

export const adminStatsQuery = () =>
  queryOptions({
    queryKey: ["admin", "stats"],
    queryFn: async () => {
      const [shops, profiles, bookings, payments] = await Promise.all([
        supabase.from("shops").select("id, status, plan, created_at", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("bookings").select("id", { count: "exact", head: true }),
        supabase.from("payments").select("amount_cents, application_fee_cents, status"),
      ]);
      const totalRevenue = (payments.data ?? []).reduce((s, p) => s + p.amount_cents, 0);
      const totalFees = (payments.data ?? []).reduce((s, p) => s + p.application_fee_cents, 0);
      const failedPayments = (payments.data ?? []).filter((p) => p.status === "failed").length;
      return {
        totalShops: shops.count ?? 0,
        totalUsers: profiles.count ?? 0,
        totalBookings: bookings.count ?? 0,
        totalRevenue,
        totalFees,
        failedPayments,
      };
    },
    staleTime: 30_000,
  });

/* ─── Shops list ─── */

export type AdminShopRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
  owner_id: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  created_at: string;
  policy_accepted_at: string | null;
  policy_version: string | null;
  subscription_status?: string | null;
  category?: string | null;
  owner_email?: string;
  owner_name?: string;
  owner_last_login_at?: string | null;
  is_active_recently?: boolean; // logged in within 14 days
  booking_count?: number;
  revenue_cents?: number;
  customer_count?: number;
  imported_customer_count?: number;
  customer_sources?: Record<string, number>;
};

export const adminShopsQuery = () =>
  queryOptions({
    queryKey: ["admin", "shops"],
    queryFn: async (): Promise<AdminShopRow[]> => {
      const { data: shops, error } = await supabase
        .from("shops")
        .select("id, name, slug, status, plan, owner_id, email, phone, address, created_at, policy_accepted_at, policy_version, subscription_status, category")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const shopIds = (shops ?? []).map((s) => s.id);
      const ownerIds = [...new Set((shops ?? []).map((s) => s.owner_id))];

      const [profilesRes, bookingsRes, paymentsRes, customersRes] = await Promise.all([
        supabase.from("profiles").select("id, email, full_name, last_login_at").in("id", ownerIds),
        supabase.from("bookings").select("id, shop_id").in("shop_id", shopIds),
        supabase.from("payments").select("shop_id, amount_cents").in("shop_id", shopIds),
        supabase.from("customers").select("shop_id, import_source").in("shop_id", shopIds),
      ]);

      const ownerMap = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));
      const bookingCounts = new Map<string, number>();
      (bookingsRes.data ?? []).forEach((b) => bookingCounts.set(b.shop_id, (bookingCounts.get(b.shop_id) ?? 0) + 1));
      const revenueMap = new Map<string, number>();
      (paymentsRes.data ?? []).forEach((p) => revenueMap.set(p.shop_id, (revenueMap.get(p.shop_id) ?? 0) + p.amount_cents));

      const customerCounts = new Map<string, number>();
      const importedCounts = new Map<string, number>();
      const sourceMap = new Map<string, Record<string, number>>();
      (customersRes.data ?? []).forEach((c) => {
        customerCounts.set(c.shop_id, (customerCounts.get(c.shop_id) ?? 0) + 1);
        const src = c.import_source ?? "manual";
        if (c.import_source) importedCounts.set(c.shop_id, (importedCounts.get(c.shop_id) ?? 0) + 1);
        const cur = sourceMap.get(c.shop_id) ?? {};
        cur[src] = (cur[src] ?? 0) + 1;
        sourceMap.set(c.shop_id, cur);
      });

      const cutoff = Date.now() - 14 * 86400000;

      return (shops ?? []).map((s) => {
        const owner = ownerMap.get(s.owner_id);
        const lastLogin = owner?.last_login_at ?? null;
        return {
          ...s,
          owner_email: owner?.email ?? undefined,
          owner_name: owner?.full_name ?? undefined,
          owner_last_login_at: lastLogin,
          is_active_recently: lastLogin ? new Date(lastLogin).getTime() >= cutoff : false,
          booking_count: bookingCounts.get(s.id) ?? 0,
          revenue_cents: revenueMap.get(s.id) ?? 0,
          customer_count: customerCounts.get(s.id) ?? 0,
          imported_customer_count: importedCounts.get(s.id) ?? 0,
          customer_sources: sourceMap.get(s.id) ?? {},
        };
      });
    },
    staleTime: 15_000,
  });

/* ─── Users list (profiles + roles) ─── */

export type AdminUserRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  last_login_at: string | null;
  primary_role: "super_admin" | "shop_owner" | "staff" | "customer" | "none";
  is_active_recently: boolean; // logged in within 14 days
  primary_shop_name?: string;
  primary_shop_id?: string;
  primary_plan?: string;
  roles: { role: string; shop_id: string | null; shop_name?: string }[];
};

export const adminUsersQuery = () =>
  queryOptions({
    queryKey: ["admin", "users"],
    queryFn: async (): Promise<AdminUserRow[]> => {
      const [profilesRes, rolesRes, shopsRes] = await Promise.all([
        supabase.from("profiles").select("id, email, full_name, created_at, last_login_at").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id, role, shop_id"),
        supabase.from("shops").select("id, name, owner_id, plan"),
      ]);
      if (profilesRes.error) throw profilesRes.error;

      const shopMap = new Map((shopsRes.data ?? []).map((s) => [s.id, s]));
      const ownerShopMap = new Map<string, { id: string; name: string; plan: string }>();
      (shopsRes.data ?? []).forEach((s) => {
        if (!ownerShopMap.has(s.owner_id)) ownerShopMap.set(s.owner_id, { id: s.id, name: s.name, plan: s.plan });
      });
      const rolesMap = new Map<string, { role: string; shop_id: string | null; shop_name?: string }[]>();
      (rolesRes.data ?? []).forEach((r) => {
        const arr = rolesMap.get(r.user_id) ?? [];
        const shop = r.shop_id ? shopMap.get(r.shop_id) : null;
        arr.push({ role: r.role, shop_id: r.shop_id, shop_name: shop?.name });
        rolesMap.set(r.user_id, arr);
      });

      const cutoff = Date.now() - 14 * 86400000;
      const ranks: Record<string, number> = { super_admin: 0, shop_owner: 1, staff: 2, customer: 3 };

      return (profilesRes.data ?? []).map((p) => {
        const roles = rolesMap.get(p.id) ?? [];
        const sortedRoles = [...roles].sort((a, b) => (ranks[a.role] ?? 9) - (ranks[b.role] ?? 9));
        const ownerShop = ownerShopMap.get(p.id);
        const primary_role = (sortedRoles[0]?.role as AdminUserRow["primary_role"]) ?? (ownerShop ? "shop_owner" : "none");
        return {
          ...p,
          roles,
          primary_role,
          is_active_recently: p.last_login_at ? new Date(p.last_login_at).getTime() >= cutoff : false,
          primary_shop_name: ownerShop?.name,
          primary_shop_id: ownerShop?.id,
          primary_plan: ownerShop?.plan,
        };
      });
    },
    staleTime: 15_000,
  });

/* ─── All bookings ─── */

export type AdminBookingRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  price_cents: number;
  currency: string;
  shop_id: string;
  shop_name?: string;
  customer_name?: string;
  service_name?: string;
  staff_name?: string;
  payment_status?: string;
};

export const adminBookingsQuery = () =>
  queryOptions({
    queryKey: ["admin", "bookings"],
    queryFn: async (): Promise<AdminBookingRow[]> => {
      const { data: bookings, error } = await supabase
        .from("bookings")
        .select(`
          id, starts_at, ends_at, status, price_cents, currency, shop_id,
          customer_id, service_id, staff_id
        `)
        .order("starts_at", { ascending: false })
        .limit(200);
      if (error) throw error;

      const shopIds = [...new Set((bookings ?? []).map((b) => b.shop_id))];
      const custIds = [...new Set((bookings ?? []).map((b) => b.customer_id).filter(Boolean))] as string[];
      const svcIds = [...new Set((bookings ?? []).map((b) => b.service_id).filter(Boolean))] as string[];
      const staffIds = [...new Set((bookings ?? []).map((b) => b.staff_id).filter(Boolean))] as string[];

      const [shopsRes, custsRes, svcsRes, staffRes, pmtsRes] = await Promise.all([
        supabase.from("shops").select("id, name").in("id", shopIds),
        custIds.length ? supabase.from("customers").select("id, full_name").in("id", custIds) : { data: [] },
        svcIds.length ? supabase.from("services").select("id, name").in("id", svcIds) : { data: [] },
        staffIds.length ? supabase.from("staff").select("id, full_name").in("id", staffIds) : { data: [] },
        supabase.from("payments").select("booking_id, status").in("booking_id", (bookings ?? []).map((b) => b.id)),
      ]);

      const shopMap = new Map((shopsRes.data ?? []).map((s) => [s.id, s.name]));
      const custMap = new Map<string, string>(((custsRes as any).data ?? []).map((c: any) => [c.id, c.full_name]));
      const svcMap = new Map<string, string>(((svcsRes as any).data ?? []).map((s: any) => [s.id, s.name]));
      const staffMap = new Map<string, string>(((staffRes as any).data ?? []).map((s: any) => [s.id, s.full_name]));
      const pmtMap = new Map<string, string>(((pmtsRes as any).data ?? []).map((p: any) => [p.booking_id, p.status]));

      return (bookings ?? []).map((b) => ({
        id: b.id,
        starts_at: b.starts_at,
        ends_at: b.ends_at,
        status: b.status,
        price_cents: b.price_cents,
        currency: b.currency,
        shop_id: b.shop_id,
        shop_name: shopMap.get(b.shop_id),
        customer_name: b.customer_id ? custMap.get(b.customer_id) : undefined,
        service_name: b.service_id ? svcMap.get(b.service_id) : undefined,
        staff_name: b.staff_id ? staffMap.get(b.staff_id) : undefined,
        payment_status: pmtMap.get(b.id),
      }));
    },
    staleTime: 15_000,
  });

/* ─── All payments ─── */

export type AdminPaymentRow = {
  id: string;
  amount_cents: number;
  application_fee_cents: number;
  currency: string;
  status: string;
  provider: string | null;
  created_at: string;
  shop_id: string;
  shop_name?: string;
  booking_id: string | null;
};

export const adminPaymentsQuery = () =>
  queryOptions({
    queryKey: ["admin", "payments"],
    queryFn: async (): Promise<AdminPaymentRow[]> => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, amount_cents, application_fee_cents, currency, status, provider, created_at, shop_id, booking_id")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;

      const shopIds = [...new Set((data ?? []).map((p) => p.shop_id))];
      const shopsRes = await supabase.from("shops").select("id, name").in("id", shopIds);
      const shopMap = new Map((shopsRes.data ?? []).map((s) => [s.id, s.name]));

      return (data ?? []).map((p) => ({
        ...p,
        shop_name: shopMap.get(p.shop_id),
      }));
    },
    staleTime: 15_000,
  });

/* ─── Single shop detail (admin) ─── */

export type AdminShopDetail = {
  shop: {
    id: string;
    name: string;
    slug: string;
    status: string;
    plan: string;
    owner_id: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    timezone: string;
    is_demo: boolean;
    admin_notes: string | null;
    created_at: string;
    plan_expires_at: string | null;
    plan_billing_cycle: string | null;
    policy_accepted_at: string | null;
    policy_version: string | null;
    subscription_status: string | null;
    booking_fee_cents_override: number | null;
    next_billing_at: string | null;
    mollie_subscription_id: string | null;
    mollie_customer_id: string | null;
    subscription_notes: string | null;
    category: string | null;
  };
  owner: { id: string; email: string | null; full_name: string | null; phone: string | null; last_login_at: string | null } | null;
  stats: {
    bookings: number;
    bookingsThisMonth: number;
    customers: number;
    importedCustomers: number;
    services: number;
    staff: number;
    revenueCents: number;
    feesCents: number;
    payments: number;
    failedPayments: number;
  };
  customerSources: { source: string; count: number }[];
  revenueLast30Days: { key: string; label: string; revenue: number; count: number }[];
  events: {
    id: string;
    action: string;
    entity: string;
    actor_email: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
  }[];
};

export const adminShopDetailQuery = (shopId: string) =>
  queryOptions({
    queryKey: ["admin", "shop-detail", shopId],
    staleTime: 15_000,
    queryFn: async (): Promise<AdminShopDetail> => {
      const { data: shop, error } = await supabase
        .from("shops")
        .select(
          "id, name, slug, status, plan, owner_id, email, phone, address, timezone, is_demo, admin_notes, created_at, plan_expires_at, plan_billing_cycle, policy_accepted_at, policy_version, subscription_status, booking_fee_cents_override, next_billing_at, mollie_subscription_id, mollie_customer_id, subscription_notes, category",
        )
        .eq("id", shopId)
        .maybeSingle();
      if (error) throw error;
      if (!shop) throw new Error("Shop niet gevonden");

      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const [ownerRes, bookingsRes, bookingsMonthRes, bookings30Res, customersRes, servicesRes, staffRes, paymentsRes, eventsRes] =
        await Promise.all([
          supabase.from("profiles").select("id, email, full_name, phone, last_login_at").eq("id", shop.owner_id).maybeSingle(),
          supabase.from("bookings").select("id", { count: "exact", head: true }).eq("shop_id", shopId),
          supabase
            .from("bookings")
            .select("id", { count: "exact", head: true })
            .eq("shop_id", shopId)
            .gte("created_at", monthStart.toISOString()),
          supabase
            .from("bookings")
            .select("starts_at, price_cents, status")
            .eq("shop_id", shopId)
            .gte("starts_at", new Date(Date.now() - 30 * 86400000).toISOString()),
          supabase.from("customers").select("import_source").eq("shop_id", shopId),
          supabase.from("services").select("id", { count: "exact", head: true }).eq("shop_id", shopId),
          supabase.from("staff").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("is_active", true),
          supabase.from("payments").select("amount_cents, application_fee_cents, status").eq("shop_id", shopId),
          supabase
            .from("activity_log")
            .select("id, action, entity, actor_email, metadata, created_at")
            .eq("shop_id", shopId)
            .order("created_at", { ascending: false })
            .limit(15),
        ]);

      // Daily revenue buckets for the last 30 days (booking starts_at, paid bookings only)
      const dayLabels = new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "short" });
      const revenueLast30Days = Array.from({ length: 30 }, (_, i) => {
        const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - (29 - i));
        return { key: d.toISOString().slice(0, 10), label: dayLabels.format(d), revenue: 0, count: 0 };
      });
      const dayIdx = new Map(revenueLast30Days.map((b, i) => [b.key, i]));
      (bookings30Res.data ?? []).forEach((b) => {
        if (b.status === "cancelled" || b.status === "no_show") return;
        const k = new Date(b.starts_at).toISOString().slice(0, 10);
        const i = dayIdx.get(k);
        if (i == null) return;
        revenueLast30Days[i].revenue += b.price_cents ?? 0;
        revenueLast30Days[i].count += 1;
      });

      const sourceMap = new Map<string, number>();
      let imported = 0;
      (customersRes.data ?? []).forEach((c) => {
        const src = c.import_source ?? "manual";
        sourceMap.set(src, (sourceMap.get(src) ?? 0) + 1);
        if (c.import_source) imported += 1;
      });
      const customerSources = [...sourceMap.entries()]
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count);

      const payments = paymentsRes.data ?? [];
      const revenueCents = payments
        .filter((p) => p.status === "paid" || p.status === "deposit_paid")
        .reduce((s, p) => s + (p.amount_cents ?? 0), 0);
      const feesCents = payments
        .filter((p) => p.status === "paid" || p.status === "deposit_paid")
        .reduce((s, p) => s + (p.application_fee_cents ?? 0), 0);
      const failedPayments = payments.filter((p) => p.status === "failed").length;

      return {
        shop,
        owner: ownerRes.data ?? null,
        stats: {
          bookings: bookingsRes.count ?? 0,
          bookingsThisMonth: bookingsMonthRes.count ?? 0,
          customers: customersRes.data?.length ?? 0,
          importedCustomers: imported,
          services: servicesRes.count ?? 0,
          staff: staffRes.count ?? 0,
          revenueCents,
          feesCents,
          payments: payments.length,
          failedPayments,
        },
        customerSources,
        revenueLast30Days,
        events: (eventsRes.data ?? []).map((e) => ({
          id: e.id,
          action: e.action,
          entity: e.entity,
          actor_email: e.actor_email,
          metadata: (e.metadata ?? {}) as Record<string, unknown>,
          created_at: e.created_at,
        })),
      };
    },
  });

/* ─── Attention items (overview panel) ─── */

export const adminAttentionQuery = () =>
  queryOptions({
    queryKey: ["admin", "attention"],
    queryFn: async () => {
      const [failedPmts, pendingShops, suspendedShops, noShows] = await Promise.all([
        supabase.from("payments").select("id", { count: "exact", head: true }).eq("status", "failed"),
        supabase.from("shops").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("shops").select("id", { count: "exact", head: true }).eq("status", "suspended"),
        supabase.from("bookings").select("id", { count: "exact", head: true }).eq("status", "no_show"),
      ]);
      return {
        failedPayments: failedPmts.count ?? 0,
        pendingShops: pendingShops.count ?? 0,
        suspendedShops: suspendedShops.count ?? 0,
        noShows: noShows.count ?? 0,
      };
    },
    staleTime: 30_000,
  });
