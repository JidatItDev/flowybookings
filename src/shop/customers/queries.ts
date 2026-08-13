import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { shopKeys, SHOP_STALE } from "@/shop/shared/query-keys";

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
