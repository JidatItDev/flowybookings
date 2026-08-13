import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { shopKeys, SHOP_STALE } from "@/shop/shared/query-keys";

export type ShopAutomationSettings = {
  confirmation_enabled: boolean;
  reminder_24h_enabled: boolean;
  reminder_2h_enabled: boolean;
  reminder_sms_enabled: boolean;
  followup_enabled: boolean;
};

export const SHOP_AUTOMATION_DEFAULTS: ShopAutomationSettings = {
  confirmation_enabled: true,
  reminder_24h_enabled: true,
  reminder_2h_enabled: true,
  reminder_sms_enabled: false,
  followup_enabled: false,
};

export const shopAutomationsQuery = (shopId: string) =>
  queryOptions({
    queryKey: shopKeys.automations(shopId),
    queryFn: async (): Promise<ShopAutomationSettings> => {
      const { data, error } = await supabase
        .from("shop_automations")
        .select(
          "confirmation_enabled, reminder_24h_enabled, reminder_2h_enabled, reminder_sms_enabled, followup_enabled",
        )
        .eq("shop_id", shopId)
        .maybeSingle();
      if (error) throw error;
      return data ?? SHOP_AUTOMATION_DEFAULTS;
    },
    staleTime: SHOP_STALE.profile,
  });

export type SmsCreditsRow = {
  balance: number;
  total_used: number;
  free_credits_granted: number;
};

export const shopSmsCreditsQuery = (shopId: string) =>
  queryOptions({
    queryKey: shopKeys.smsCredits(shopId),
    queryFn: async (): Promise<SmsCreditsRow> => {
      const { data, error } = await supabase
        .from("shop_sms_credits")
        .select("balance, total_used, free_credits_granted")
        .eq("shop_id", shopId)
        .maybeSingle();
      if (error) throw error;
      return data ?? { balance: 0, total_used: 0, free_credits_granted: 0 };
    },
    staleTime: SHOP_STALE.operational,
  });
