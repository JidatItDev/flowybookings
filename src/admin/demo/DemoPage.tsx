// Hidden admin page: demo-mode controls.
// Lives under /beheer/dashboard/demo, gated by RequireSuperAdmin via AdminLayout.


import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Beaker, RefreshCw, Store, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { AdminLayout } from "@/admin/shell/AdminLayout";
import { PageHeader } from "@/shared/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { adminAppSettingsQuery, type AppSettings } from "@/shared/lib/app-settings";
import { useT } from "@/shared/lib/i18n";

type SettingKey = keyof AppSettings;

export function AdminDemoPage() {
  const { t } = useT();
  const qc = useQueryClient();
  const settingsQ = useQuery(adminAppSettingsQuery());
  const shopsQ = useQuery({
    queryKey: ["admin", "shops", "demo-flag"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shops")
        .select("id, name, slug, status, plan, is_demo")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const updateSetting = useMutation({
    mutationFn: async (patch: Partial<AppSettings>) => {
      const { error } = await supabase.from("app_settings").update(patch).eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app-settings"] });
      toast.success(t("adminDemo.saved"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleShopDemo = useMutation({
    mutationFn: async ({ id, is_demo }: { id: string; is_demo: boolean }) => {
      const { error } = await supabase.from("shops").update({ is_demo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "shops"] });
      toast.success(t("adminDemo.shopUpdated"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reseedDemo = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/seed-demo-users`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Seed failed");
      return json;
    },
    onSuccess: () => toast.success(t("adminDemo.reseeded")),
    onError: (e: Error) => toast.error(e.message),
  });

  const settings = settingsQ.data;

  const toggles: Array<{ key: SettingKey; titleKey: string; descKey: string }> = [
    { key: "demo_mode_enabled", titleKey: "adminDemo.modeTitle", descKey: "adminDemo.modeDesc" },
    { key: "demo_logins_enabled", titleKey: "adminDemo.loginsTitle", descKey: "adminDemo.loginsDesc" },
    { key: "public_booking_on_demo_shops_enabled", titleKey: "adminDemo.publicBookingTitle", descKey: "adminDemo.publicBookingDesc" },
    { key: "seeded_demo_data_visible", titleKey: "adminDemo.dataTitle", descKey: "adminDemo.dataDesc" },
  ];

  return (
    <AdminLayout>
      <PageHeader
        title={t("adminDemo.title")}
        description={t("adminDemo.description")}
      />

      {!settings?.demo_mode_enabled && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-border bg-card p-4 text-sm shadow-soft">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-pink" />
          <div>
            <p className="font-medium">{t("adminDemo.warningTitle")}</p>
            <p className="text-xs text-muted-foreground">{t("adminDemo.warningDesc")}</p>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <div className="mb-4 flex items-center gap-2">
            <Beaker className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">{t("adminDemo.flagsTitle")}</h2>
          </div>
          {settingsQ.isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <ul className="divide-y divide-border">
              {toggles.map(({ key, titleKey, descKey }) => (
                <li key={key} className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{t(titleKey)}</p>
                    <p className="text-xs text-muted-foreground">{t(descKey)}</p>
                  </div>
                  <Switch
                    checked={!!settings?.[key]}
                    disabled={updateSetting.isPending}
                    onCheckedChange={(v) => updateSetting.mutate({ [key]: v } as Partial<AppSettings>)}
                  />
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5 border-t border-border pt-5">
            <p className="text-sm font-medium">{t("adminDemo.reseedTitle")}</p>
            <p className="text-xs text-muted-foreground">{t("adminDemo.reseedDesc")}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => reseedDemo.mutate()}
              disabled={reseedDemo.isPending}
            >
              {reseedDemo.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {t("adminDemo.reseedCta")}
            </Button>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <div className="mb-4 flex items-center gap-2">
            <Store className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">{t("adminDemo.shopsTitle")}</h2>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">{t("adminDemo.shopsDesc")}</p>
          {shopsQ.isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <ul className="divide-y divide-border">
              {(shopsQ.data ?? []).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{s.name}</p>
                    <p className="truncate text-xs text-muted-foreground">/{s.slug} · {s.status} · {s.plan}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.is_demo && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                        {t("adminDemo.demoBadge")}
                      </span>
                    )}
                    <Switch
                      checked={!!s.is_demo}
                      disabled={toggleShopDemo.isPending}
                      onCheckedChange={(v) => toggleShopDemo.mutate({ id: s.id, is_demo: v })}
                    />
                  </div>
                </li>
              ))}
              {(shopsQ.data ?? []).length === 0 && (
                <li className="py-4 text-center text-sm text-muted-foreground">{t("adminDemo.noShops")}</li>
              )}
            </ul>
          )}
        </section>
      </div>
    </AdminLayout>
  );
}
