// Extra admin queries (kept separate to avoid touching admin-queries.ts).
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ActivityLogRow = {
  id: string;
  shop_id: string | null;
  actor_user_id: string | null;
  actor_email: string | null;
  action: string;
  entity: string;
  metadata: Record<string, unknown>;
  created_at: string;
  shop_name?: string;
};

export const adminActivityLogQuery = () =>
  queryOptions({
    queryKey: ["admin", "activity_log"],
    queryFn: async (): Promise<ActivityLogRow[]> => {
      const { data, error } = await supabase
        .from("activity_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const rows = (data ?? []) as ActivityLogRow[];
      const shopIds = [...new Set(rows.map((r) => r.shop_id).filter(Boolean) as string[])];
      if (shopIds.length === 0) return rows;
      const { data: shops } = await supabase.from("shops").select("id, name").in("id", shopIds);
      const map = new Map((shops ?? []).map((s) => [s.id, s.name]));
      return rows.map((r) => ({ ...r, shop_name: r.shop_id ? map.get(r.shop_id) : undefined }));
    },
    staleTime: 15_000,
  });
