import { useEffect, useState } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { shopKeys, type BookingWithRelations } from "@/shop/shared/queries-barrel";

export type RealtimeStatus = "idle" | "connecting" | "live" | "error" | "closed";

/**
 * Subscribes to Postgres changes on `public.bookings` for the active shop and
 * patches every currently-cached bookings query in place — both the unscoped
 * `bookingsQuery` cache (other pages) and any `calendarBookingsQuery` range
 * caches the calendar has mounted (active view + any prefetched adjacent one).
 *
 * Supabase Realtime's `postgres_changes` filter only supports a single
 * equality condition, so it can't express a two-sided date-range server-side
 * — the subscription itself stays filtered by `shop_id` only, same as before.
 * What's new is client-side: a range cache only gets patched if the changed
 * row's [starts_at, ends_at) actually overlaps that cache's window, instead
 * of every event blindly refetching/patching a single fixed cache.
 *
 * - INSERT → append to each overlapping cache (deduped by id)
 * - UPDATE → replace matching row in each overlapping cache (and remove it
 *   from any cache it no longer overlaps, e.g. after a reschedule)
 * - DELETE → remove matching row from every cache
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
    const unscopedKey = shopKeys.bookings(shopId);

    // A `calendarBookings` key is `["shop", shopId, "bookings", "range", startIso, endIso]`
    // (see shopKeys.calendarBookings) — parse the window back out to test overlap.
    function rangeFromKey(key: QueryKey): { start: number; end: number } | null {
      if (key.length !== 6 || key[3] !== "range") return null;
      const start = Date.parse(String(key[4]));
      const end = Date.parse(String(key[5]));
      if (Number.isNaN(start) || Number.isNaN(end)) return null;
      return { start, end };
    }

    // Every bookings cache currently mounted for this shop: the unscoped one
    // (always relevant) plus every calendarBookings range cache present.
    function liveBookingsCaches(): { key: QueryKey; range: { start: number; end: number } | null }[] {
      // Prefix match (default TanStack behavior, same as invalidateQueries)
      // returns both the unscoped key and every calendarBookings range key —
      // restricted to "active" (mounted) so we never resurrect/patch a range
      // the calendar has since evicted.
      const entries = qc.getQueryCache().findAll({ queryKey: unscopedKey, type: "active" });
      return entries.map((e) => ({ key: e.queryKey, range: rangeFromKey(e.queryKey) }));
    }

    function overlaps(range: { start: number; end: number } | null, row: BookingWithRelations): boolean {
      if (!range) return true; // unscoped cache: always relevant
      const rowStart = new Date(row.starts_at).getTime();
      const rowEnd = new Date(row.ends_at).getTime();
      return rowStart < range.end && rowEnd > range.start;
    }

    const applyUpsert = (row: BookingWithRelations) => {
      for (const { key, range } of liveBookingsCaches()) {
        const inRange = overlaps(range, row);
        qc.setQueryData<BookingWithRelations[]>(key, (prev) => {
          const list = prev ?? [];
          const idx = list.findIndex((b) => b.id === row.id);
          if (!inRange) {
            // Row moved out of this range's window (e.g. rescheduled elsewhere) — drop it.
            return idx === -1 ? list : list.filter((b) => b.id !== row.id);
          }
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
      }
    };

    const applyDelete = (id: string) => {
      for (const { key } of liveBookingsCaches()) {
        qc.setQueryData<BookingWithRelations[]>(key, (prev) =>
          (prev ?? []).filter((b) => b.id !== id),
        );
      }
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
