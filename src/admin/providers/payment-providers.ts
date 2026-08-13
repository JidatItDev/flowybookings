import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  paymentProviderKeys,
  type ShopPaymentProvider,
} from "@/shop/payments/payment-providers";

export type {
  ConnectionStatus,
  OnboardingStatus,
  ShopPaymentProvider,
} from "@/shop/payments/payment-providers";
export { paymentProviderKeys } from "@/shop/payments/payment-providers";

export const adminPaymentProvidersQuery = () =>
  queryOptions({
    queryKey: paymentProviderKeys.adminAll(),
    queryFn: async (): Promise<(ShopPaymentProvider & { shop_name?: string })[]> => {
      const { data, error } = await (supabase as any)
        .from("shop_payment_providers")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as ShopPaymentProvider[];
      const shopIds = [...new Set(rows.map((r) => r.shop_id))];
      if (shopIds.length === 0) return [];
      const { data: shops } = await supabase.from("shops").select("id, name").in("id", shopIds);
      const m = new Map((shops ?? []).map((s) => [s.id, s.name]));
      return rows.map((r) => ({ ...r, shop_name: m.get(r.shop_id) }));
    },
    staleTime: 15_000,
  });
