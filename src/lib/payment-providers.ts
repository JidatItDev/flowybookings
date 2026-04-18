import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ConnectionStatus = "not_connected" | "pending" | "connected" | "disconnected" | "error";
export type OnboardingStatus = "not_started" | "in_review" | "completed" | "rejected";

export type ShopPaymentProvider = {
  id: string;
  shop_id: string;
  provider: string;
  provider_account_id: string | null;
  connection_status: ConnectionStatus;
  onboarding_status: OnboardingStatus;
  application_fee_enabled: boolean;
  application_fee_percent: number;
  payment_methods_enabled: string[];
  metadata: Record<string, unknown>;
  connected_at: string | null;
  disconnected_at: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

export const paymentProviderKeys = {
  byShop: (shopId: string) => ["payment-provider", shopId] as const,
  adminAll: () => ["admin", "payment-providers"] as const,
};

export const shopPaymentProviderQuery = (shopId: string) =>
  queryOptions({
    queryKey: paymentProviderKeys.byShop(shopId),
    queryFn: async (): Promise<ShopPaymentProvider | null> => {
      const { data, error } = await (supabase as any)
        .from("shop_payment_providers")
        .select("*")
        .eq("shop_id", shopId)
        .eq("provider", "mollie")
        .maybeSingle();
      if (error) throw error;
      return (data as ShopPaymentProvider | null) ?? null;
    },
    staleTime: 15_000,
  });

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
