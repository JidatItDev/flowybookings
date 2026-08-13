import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { shopKeys, SHOP_STALE } from "./query-keys";

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
    staleTime: SHOP_STALE.profile,
  });
