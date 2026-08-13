import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { shopKeys, SHOP_STALE } from "@/shop/shared/query-keys";

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
