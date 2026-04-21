import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { shopKeys, type BookingWithRelations } from "@/lib/queries";

/**
 * Subscribes to Postgres changes on `public.bookings` for the active shop
 * and patches the existing `bookingsQuery` cache in place.
 *
 * - INSERT → append to cache (deduped by id)
 * - UPDATE → replace matching row
 * - DELETE → remove matching row
 *
 * No extra refetches; we reuse the same cache key (`shopKeys.bookings`) that
 * the calendar, customers and analytics pages already read from.
 */
export function useBookingsRealtime(shopId: string | null | undefined) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!shopId) return;

    const key = shopKeys.bookings(shopId);

    const applyUpsert = (row: BookingWithRelations) => {
      qc.setQueryData<BookingWithRelations[]>(key, (prev) => {
        const list = prev ?? [];
        const idx = list.findIndex((b) => b.id === row.id);
        if (idx === -1) {
          // Insert sorted by starts_at ascending to match initial query order.
          const next = [...list, row];
          next.sort(
            (a, b) =>
              new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
          );
          return next;
        }
        const next = list.slice();
        next[idx] = { ...next[idx], ...row };
        return next;
      });
    };

    const applyDelete = (id: string) => {
      qc.setQueryData<BookingWithRelations[]>(key, (prev) =>
        (prev ?? []).filter((b) => b.id !== id),
      );
    };

    const channel = supabase
      .channel(`bookings:shop:${shopId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "bookings",
          filter: `shop_id=eq.${shopId}`,
        },
        (payload) => {
          const row = payload.new as BookingWithRelations | undefined;
          if (row?.id) applyUpsert(row);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "bookings",
          filter: `shop_id=eq.${shopId}`,
        },
        (payload) => {
          const row = payload.new as BookingWithRelations | undefined;
          if (row?.id) applyUpsert(row);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "bookings",
          // Note: DELETE filter requires REPLICA IDENTITY FULL on the table.
          filter: `shop_id=eq.${shopId}`,
        },
        (payload) => {
          const row = payload.old as { id?: string } | undefined;
          if (row?.id) applyDelete(row.id);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, shopId]);
}
