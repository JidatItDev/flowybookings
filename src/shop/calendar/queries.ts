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
  /** Who created this booking — 'online' (public checkout) or 'manual' (shop
   * owner). Null for pre-migration rows the backfill couldn't resolve (a
   * no-deposit booking with no payment row is ambiguous either way). */
  created_via: "online" | "manual" | null;
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

/**
 * Calendar-grid-scoped variant of `bookingsQuery` — fetches only bookings
 * overlapping [rangeStart, rangeEnd), not the shop's entire history. The
 * calendar page (day/week grid + the day-chip strip) is the only consumer;
 * every other page keeps using the unscoped `bookingsQuery` above.
 *
 * Filters on overlap (`starts_at < rangeEnd && ends_at > rangeStart`), not
 * just `starts_at` inside the window, so a booking that started just before
 * the window but is still running when it opens isn't dropped.
 */
export const calendarBookingsQuery = (shopId: string, rangeStart: Date, rangeEnd: Date) =>
  queryOptions({
    queryKey: shopKeys.calendarBookings(shopId, rangeStart.toISOString(), rangeEnd.toISOString()),
    queryFn: async (): Promise<BookingWithRelations[]> => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .eq("shop_id", shopId)
        .lt("starts_at", rangeEnd.toISOString())
        .gt("ends_at", rangeStart.toISOString())
        .order("starts_at", { ascending: true });
      if (error) throw error;
      return (data as BookingWithRelations[]) ?? [];
    },
    staleTime: SHOP_STALE.bookings,
  });
