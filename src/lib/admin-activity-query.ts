// Admin activity log: laatste 500 events met shop-naam join.
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AdminActivityEvent = {
  id: string;
  action: string;
  entity: string;
  shop_id: string | null;
  shop_name: string | null;
  actor_email: string | null;
  actor_user_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export const ADMIN_ACTIVITY_LIMIT = 500;

export const adminActivityLogQuery = () =>
  queryOptions({
    queryKey: ["admin", "activity-log-full"],
    staleTime: 10_000,
    queryFn: async (): Promise<AdminActivityEvent[]> => {
      const { data, error } = await supabase
        .from("activity_log")
        .select("id, action, entity, shop_id, actor_email, actor_user_id, metadata, created_at")
        .order("created_at", { ascending: false })
        .limit(ADMIN_ACTIVITY_LIMIT);
      if (error) throw error;

      const shopIds = [...new Set((data ?? []).map((r) => r.shop_id).filter(Boolean))] as string[];
      let shopMap = new Map<string, string>();
      if (shopIds.length) {
        const { data: shops } = await supabase.from("shops").select("id, name").in("id", shopIds);
        shopMap = new Map((shops ?? []).map((s) => [s.id, s.name]));
      }

      return (data ?? []).map((r) => ({
        id: r.id,
        action: r.action,
        entity: r.entity,
        shop_id: r.shop_id,
        shop_name: r.shop_id ? (shopMap.get(r.shop_id) ?? null) : null,
        actor_email: r.actor_email,
        actor_user_id: r.actor_user_id,
        metadata: (r.metadata ?? {}) as Record<string, unknown>,
        created_at: r.created_at,
      }));
    },
  });

// Quote a CSV cell — wrap in quotes if it contains comma, quote, newline.
function csvCell(value: unknown): string {
  if (value == null) return "";
  const s = typeof value === "string" ? value : JSON.stringify(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function activityToCsv(events: AdminActivityEvent[]): string {
  const header = ["created_at", "action", "entity", "shop_name", "shop_id", "actor_email", "metadata"];
  const lines = [header.join(",")];
  for (const e of events) {
    lines.push(
      [
        e.created_at,
        e.action,
        e.entity,
        e.shop_name ?? "",
        e.shop_id ?? "",
        e.actor_email ?? "",
        JSON.stringify(e.metadata ?? {}),
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
