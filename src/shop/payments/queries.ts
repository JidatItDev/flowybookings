import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { shopKeys, SHOP_STALE } from "@/shop/shared/query-keys";

export const paymentsQuery = (shopId: string) =>
  queryOptions({
    queryKey: shopKeys.payments(shopId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("shop_id", shopId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: SHOP_STALE.operational,
  });

export type PaymentProviderStatusRow = {
  connection_status: string;
};

/** Lightweight status list for onboarding checklist (not the full Mollie row). */
export const shopPaymentProvidersStatusQuery = (shopId: string) =>
  queryOptions({
    queryKey: shopKeys.paymentProvidersStatus(shopId),
    queryFn: async (): Promise<PaymentProviderStatusRow[]> => {
      const { data, error } = await supabase
        .from("shop_payment_providers")
        .select("connection_status")
        .eq("shop_id", shopId);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: SHOP_STALE.profile,
  });
