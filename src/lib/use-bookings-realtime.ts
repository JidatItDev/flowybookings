import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { shopKeys, type BookingWithRelations } from "@/lib/queries";

export type RealtimeStatus = "idle" | "connecting" | "live" | "error" | "closed";

/**
 * Subscribes to Postgres changes on `public.bookings` for the active shop
 * and patches the existing `bookingsQuery` cache in place.
 *
 * - INSERT → append to cache (deduped by id)
 * - UPDATE → replace matching row
 * - DELETE → remove matching row
 *
 * Returns a status reflecting the underlying Realtime channel state so the UI
 * can show a live/offline indicator.
 */
export function useBookingsRealtime(
  shopId: string | null | undefined,
): RealtimeStatus {
  const qc = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>("idle");

  useEffect(() => {
    if (!shopId) {
      setStatus("idle");
      return;
    }

    setStatus("connecting");
    const key = shopKeys.bookings(shopId);

    const applyUpsert = (row: BookingWithRelations) => {
      qc.setQueryData<BookingWithRelations[]>(key, (prev) => {
        const list = prev ?? [];
        const idx = list.findIndex((b) => b.id === row.id);
        if (idx === -1) {
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
          filter: `shop_id=eq.${shopId}`,
        },
        (payload) => {
          const row = payload.old as { id?: string } | undefined;
          if (row?.id) applyDelete(row.id);
        },
      )
      .subscribe((s) => {
        // Map Supabase channel states to a small UI-friendly enum.
        if (s === "SUBSCRIBED") setStatus("live");
        else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") setStatus("error");
        else if (s === "CLOSED") setStatus("closed");
      });

    return () => {
      supabase.removeChannel(channel);
      setStatus("idle");
    };
  }, [qc, shopId]);

  return status;
}
