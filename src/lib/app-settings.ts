// Public/admin access to platform-wide app settings (demo mode toggles, etc).
// Public reads use the SECURITY DEFINER RPC `get_public_app_settings` which exposes
// only safe boolean flags. Admin reads/writes hit the underlying table, gated by RLS.

import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppSettings = {
  demo_mode_enabled: boolean;
  demo_logins_enabled: boolean;
  public_booking_on_demo_shops_enabled: boolean;
  seeded_demo_data_visible: boolean;
};

export const APP_SETTINGS_DEFAULTS: AppSettings = {
  demo_mode_enabled: true,
  demo_logins_enabled: true,
  public_booking_on_demo_shops_enabled: true,
  seeded_demo_data_visible: true,
};

export const publicAppSettingsQuery = () =>
  queryOptions({
    queryKey: ["app-settings", "public"],
    staleTime: 60_000,
    queryFn: async (): Promise<AppSettings> => {
      const { data, error } = await supabase.rpc("get_public_app_settings");
      if (error) return APP_SETTINGS_DEFAULTS;
      const row = Array.isArray(data) ? data[0] : data;
      return row ? (row as AppSettings) : APP_SETTINGS_DEFAULTS;
    },
  });

export const adminAppSettingsQuery = () =>
  queryOptions({
    queryKey: ["app-settings", "admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
