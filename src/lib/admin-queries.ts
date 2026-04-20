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
  owner_email?: string;
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
        .select("id, name, slug, status, plan, owner_id, email, phone, address, created_at, policy_accepted_at, policy_version")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const shopIds = (shops ?? []).map((s) => s.id);
      const ownerIds = [...new Set((shops ?? []).map((s) => s.owner_id))];

      const [profilesRes, bookingsRes, paymentsRes, customersRes] = await Promise.all([
        supabase.from("profiles").select("id, email").in("id", ownerIds),
        supabase.from("bookings").select("id, shop_id").in("shop_id", shopIds),
        supabase.from("payments").select("shop_id, amount_cents").in("shop_id", shopIds),
        supabase.from("customers").select("shop_id, import_source").in("shop_id", shopIds),
      ]);

      const ownerMap = new Map((profilesRes.data ?? []).map((p) => [p.id, p.email]));
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

      return (shops ?? []).map((s) => ({
        ...s,
        owner_email: ownerMap.get(s.owner_id) ?? undefined,
        booking_count: bookingCounts.get(s.id) ?? 0,
        revenue_cents: revenueMap.get(s.id) ?? 0,
        customer_count: customerCounts.get(s.id) ?? 0,
        imported_customer_count: importedCounts.get(s.id) ?? 0,
        customer_sources: sourceMap.get(s.id) ?? {},
      }));
    },
    staleTime: 15_000,
  });

/* ─── Users list (profiles + roles) ─── */

export type AdminUserRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  roles: { role: string; shop_id: string | null; shop_name?: string }[];
};

export const adminUsersQuery = () =>
  queryOptions({
    queryKey: ["admin", "users"],
    queryFn: async (): Promise<AdminUserRow[]> => {
      const [profilesRes, rolesRes, shopsRes] = await Promise.all([
        supabase.from("profiles").select("id, email, full_name, created_at").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id, role, shop_id"),
        supabase.from("shops").select("id, name"),
      ]);
      if (profilesRes.error) throw profilesRes.error;

      const shopMap = new Map((shopsRes.data ?? []).map((s) => [s.id, s.name]));
      const rolesMap = new Map<string, { role: string; shop_id: string | null; shop_name?: string }[]>();
      (rolesRes.data ?? []).forEach((r) => {
        const arr = rolesMap.get(r.user_id) ?? [];
        arr.push({ role: r.role, shop_id: r.shop_id, shop_name: r.shop_id ? shopMap.get(r.shop_id) : undefined });
        rolesMap.set(r.user_id, arr);
      });

      return (profilesRes.data ?? []).map((p) => ({
        ...p,
        roles: rolesMap.get(p.id) ?? [],
      }));
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
  };
  owner: { id: string; email: string | null; full_name: string | null; phone: string | null } | null;
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
          "id, name, slug, status, plan, owner_id, email, phone, address, timezone, is_demo, admin_notes, created_at, plan_expires_at, plan_billing_cycle, policy_accepted_at, policy_version",
        )
        .eq("id", shopId)
        .maybeSingle();
      if (error) throw error;
      if (!shop) throw new Error("Shop niet gevonden");

      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const [ownerRes, bookingsRes, bookingsMonthRes, customersRes, servicesRes, staffRes, paymentsRes, eventsRes] =
        await Promise.all([
          supabase.from("profiles").select("id, email, full_name, phone").eq("id", shop.owner_id).maybeSingle(),
          supabase.from("bookings").select("id", { count: "exact", head: true }).eq("shop_id", shopId),
          supabase
            .from("bookings")
            .select("id", { count: "exact", head: true })
            .eq("shop_id", shopId)
            .gte("created_at", monthStart.toISOString()),
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
