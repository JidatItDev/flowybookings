// Centralised TanStack Query factories for shop-scoped data.
// All queries assume the active shop id is already known.

import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const shopKeys = {
  services: (shopId: string) => ["shop", shopId, "services"] as const,
  staff: (shopId: string) => ["shop", shopId, "staff"] as const,
  customers: (shopId: string) => ["shop", shopId, "customers"] as const,
  bookings: (shopId: string) => ["shop", shopId, "bookings"] as const,
  payments: (shopId: string) => ["shop", shopId, "payments"] as const,
  shopFull: (shopId: string) => ["shop", shopId, "full"] as const,
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
  });
