// In-app notifications inbox helpers + realtime hook.
// Distinct from `shop_automations` (which controls outbound channel delivery).

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type NotificationType = "system" | "billing" | "bookings" | "alerts" | "admin";

export type NotificationRow = {
  id: string;
  shop_id: string;
  type: NotificationType;
  title: string;
  message: string;
  action_url: string | null;
  is_read: boolean;
  read_at: string | null;
  created_by: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export const notificationKeys = {
  all: ["notifications"] as const,
  list: (shopId: string) => ["notifications", "list", shopId] as const,
  unread: (shopId: string) => ["notifications", "unread", shopId] as const,
};

export async function fetchNotifications(shopId: string): Promise<NotificationRow[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as NotificationRow[];
}

export async function markRead(id: string) {
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function markAllRead(shopId: string) {
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("shop_id", shopId)
    .eq("is_read", false);
  if (error) throw error;
}

export async function deleteNotification(id: string) {
  const { error } = await supabase.from("notifications").delete().eq("id", id);
  if (error) throw error;
}

export function useShopNotifications(shopId: string | null | undefined) {
  return useQuery({
    queryKey: notificationKeys.list(shopId ?? ""),
    enabled: !!shopId,
    queryFn: () => fetchNotifications(shopId!),
    staleTime: 30_000,
  });
}

/** Subscribes to realtime changes for the active shop and refreshes the cache. */
export function useNotificationsRealtime(shopId: string | null | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!shopId) return;
    const channel = supabase
      .channel(`notifications:${shopId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `shop_id=eq.${shopId}` },
        () => {
          qc.invalidateQueries({ queryKey: notificationKeys.list(shopId) });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [shopId, qc]);
}
