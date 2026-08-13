// Centralised TanStack Query factories for shop-scoped data.
//
// App-wide convention (keep components thin):
// 1. Keys live in `shopKeys` — never invent inline queryKey arrays in components.
// 2. Factories return `queryOptions(...)` — components call
//    `useQuery({ ...factory(id), enabled: !!id })` (or `useQuery(factory(id))`).
// 3. Mutations invalidate via `shopKeys.*` only — never ad-hoc strings.
// 4. Prefer an existing factory over a page-local queryFn for the same resource.
// 5. Domain modules may own their own keys (e.g. `paymentProviderKeys`,
//    `notificationKeys`) but follow the same factory pattern.

import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Default stale windows — override per factory when the data churn rate differs. */
export const SHOP_STALE = {
  /** Rarely edited catalogs (services, staff, links). */
  catalog: 5 * 60_000,
  /** Shop profile / settings-ish rows. */
  profile: 2 * 60_000,
  /** Operational lists that change often but aren't realtime-patched. */
  operational: 30_000,
  /** Bookings — short; calendar also patches via use-bookings-realtime. */
  bookings: 15_000,
} as const;

export const shopKeys = {
  all: (shopId: string) => ["shop", shopId] as const,
  services: (shopId: string) => ["shop", shopId, "services"] as const,
  staff: (shopId: string) => ["shop", shopId, "staff"] as const,
  staffServices: (shopId: string) => ["shop", shopId, "staff_services"] as const,
  customers: (shopId: string) => ["shop", shopId, "customers"] as const,
  customer: (shopId: string, customerId: string) =>
    ["shop", shopId, "customer", customerId] as const,
  customerPayments: (shopId: string, customerId: string) =>
    ["shop", shopId, "customer", customerId, "payments"] as const,
  bookings: (shopId: string) => ["shop", shopId, "bookings"] as const,
  payments: (shopId: string) => ["shop", shopId, "payments"] as const,
  shopFull: (shopId: string) => ["shop", shopId, "full"] as const,
  automations: (shopId: string) => ["shop", shopId, "automations"] as const,
  smsCredits: (shopId: string) => ["shop", shopId, "sms_credits"] as const,
  paymentProvidersStatus: (shopId: string) =>
    ["shop", shopId, "payment-providers-status"] as const,
};

export const shopFullQuery = (shopId: string) =>
  queryOptions({
    queryKey: shopKeys.shopFull(shopId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shops")
        .select("*")
        .eq("id", shopId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: SHOP_STALE.profile,
  });

export const servicesQuery = (shopId: string) =>
  queryOptions({
    queryKey: shopKeys.services(shopId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .eq("shop_id", shopId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: SHOP_STALE.catalog,
  });

export const staffQuery = (shopId: string) =>
  queryOptions({
    queryKey: shopKeys.staff(shopId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("*")
        .eq("shop_id", shopId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: SHOP_STALE.catalog,
  });

export type StaffServiceLink = {
  staff_id: string;
  service_id: string;
};

export const staffServicesQuery = (shopId: string) =>
  queryOptions({
    queryKey: shopKeys.staffServices(shopId),
    queryFn: async (): Promise<StaffServiceLink[]> => {
      const { data, error } = await supabase
        .from("staff_services")
        .select("staff_id, service_id");
      if (error) throw error;
      return (data ?? []) as StaffServiceLink[];
    },
    staleTime: SHOP_STALE.catalog,
  });

export const customersQuery = (shopId: string) =>
  queryOptions({
    queryKey: shopKeys.customers(shopId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("shop_id", shopId)
        .order("last_visit_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: SHOP_STALE.operational,
  });

export type CustomerPreferences = {
  favorite_staff_id?: string | null;
  favorite_service_id?: string | null;
  allergies?: string;
  communication?: "email" | "sms" | "any" | "none";
  language?: "nl" | "en" | "any";
  notes?: string;
};

export type CustomerDetail = {
  id: string;
  shop_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  total_spent_cents: number;
  last_visit_at: string | null;
  no_show_count: number;
  requires_deposit: boolean;
  tags: string[] | null;
  preferences: CustomerPreferences | null;
  created_at: string;
  import_source: string | null;
  imported_at: string | null;
};

export const customerDetailQuery = (shopId: string, customerId: string) =>
  queryOptions({
    queryKey: shopKeys.customer(shopId, customerId),
    queryFn: async (): Promise<CustomerDetail | null> => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("id", customerId)
        .eq("shop_id", shopId)
        .maybeSingle();
      if (error) throw error;
      return data as CustomerDetail | null;
    },
    staleTime: SHOP_STALE.operational,
  });

export type CustomerPaymentRow = {
  id: string;
  booking_id: string | null;
  amount_cents: number;
  currency: string;
  status: string;
  provider: string;
  provider_payment_id: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

/**
 * Stable key: shop + customer only. Booking IDs are resolved inside the queryFn
 * so settling the bookings list cannot thrash the payments cache.
 */
export const customerPaymentsQuery = (shopId: string, customerId: string) =>
  queryOptions({
    queryKey: shopKeys.customerPayments(shopId, customerId),
    queryFn: async (): Promise<CustomerPaymentRow[]> => {
      const { data: bookingRows, error: bookingError } = await supabase
        .from("bookings")
        .select("id")
        .eq("shop_id", shopId)
        .eq("customer_id", customerId);
      if (bookingError) throw bookingError;
      const bookingIds = (bookingRows ?? []).map((b) => b.id);
      if (bookingIds.length === 0) return [];

      const { data, error } = await supabase
        .from("payments")
        .select(
          "id, booking_id, amount_cents, currency, status, provider, provider_payment_id, created_at, metadata",
        )
        .in("booking_id", bookingIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CustomerPaymentRow[];
    },
    staleTime: SHOP_STALE.operational,
  });

export type BookingWithRelations = {
  id: string;
  shop_id: string;
  starts_at: string;
  ends_at: string;
  status: "pending" | "confirmed" | "completed" | "cancelled" | "no_show";
  price_cents: number;
  deposit_cents: number;
  notes: string | null;
  customer_id: string | null;
  staff_id: string | null;
  service_id: string | null;
};

export const bookingsQuery = (shopId: string) =>
  queryOptions({
    queryKey: shopKeys.bookings(shopId),
    queryFn: async (): Promise<BookingWithRelations[]> => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .eq("shop_id", shopId)
        .order("starts_at", { ascending: true });
      if (error) throw error;
      return (data as BookingWithRelations[]) ?? [];
    },
    staleTime: SHOP_STALE.bookings,
  });

export const paymentsQuery = (shopId: string) =>
  queryOptions({
    queryKey: shopKeys.payments(shopId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("shop_id", shopId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: SHOP_STALE.operational,
  });

export type ShopAutomationSettings = {
  confirmation_enabled: boolean;
  reminder_24h_enabled: boolean;
  reminder_2h_enabled: boolean;
  reminder_sms_enabled: boolean;
  followup_enabled: boolean;
};

export const SHOP_AUTOMATION_DEFAULTS: ShopAutomationSettings = {
  confirmation_enabled: true,
  reminder_24h_enabled: true,
  reminder_2h_enabled: true,
  reminder_sms_enabled: false,
  followup_enabled: false,
};

export const shopAutomationsQuery = (shopId: string) =>
  queryOptions({
    queryKey: shopKeys.automations(shopId),
    queryFn: async (): Promise<ShopAutomationSettings> => {
      const { data, error } = await supabase
        .from("shop_automations")
        .select(
          "confirmation_enabled, reminder_24h_enabled, reminder_2h_enabled, reminder_sms_enabled, followup_enabled",
        )
        .eq("shop_id", shopId)
        .maybeSingle();
      if (error) throw error;
      return data ?? SHOP_AUTOMATION_DEFAULTS;
    },
    staleTime: SHOP_STALE.profile,
  });

export type SmsCreditsRow = {
  balance: number;
  total_used: number;
  free_credits_granted: number;
};

export const shopSmsCreditsQuery = (shopId: string) =>
  queryOptions({
    queryKey: shopKeys.smsCredits(shopId),
    queryFn: async (): Promise<SmsCreditsRow> => {
      const { data, error } = await supabase
        .from("shop_sms_credits")
        .select("balance, total_used, free_credits_granted")
        .eq("shop_id", shopId)
        .maybeSingle();
      if (error) throw error;
      return data ?? { balance: 0, total_used: 0, free_credits_granted: 0 };
    },
    staleTime: SHOP_STALE.operational,
  });

export type PaymentProviderStatusRow = {
  connection_status: string;
};

/** Lightweight status list for onboarding checklist (not the full Mollie row). */
export const shopPaymentProvidersStatusQuery = (shopId: string) =>
  queryOptions({
    queryKey: shopKeys.paymentProvidersStatus(shopId),
    queryFn: async (): Promise<PaymentProviderStatusRow[]> => {
      const { data, error } = await supabase
        .from("shop_payment_providers")
        .select("connection_status")
        .eq("shop_id", shopId);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: SHOP_STALE.profile,
  });
