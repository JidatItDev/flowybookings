import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { shopKeys, SHOP_STALE } from "@/shop/shared/query-keys";

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
    staleTime: SHOP_STALE.catalog,
  });

export type StaffServiceLink = {
  staff_id: string;
  service_id: string;
};

export const staffServicesQuery = (shopId: string) =>
  queryOptions({
    queryKey: shopKeys.staffServices(shopId),
    queryFn: async (): Promise<StaffServiceLink[]> => {
      const { data, error } = await supabase
        .from("staff_services")
        .select("staff_id, service_id");
      if (error) throw error;
      return (data ?? []) as StaffServiceLink[];
    },
    staleTime: SHOP_STALE.catalog,
  });
