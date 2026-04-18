import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, MessageSquare, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { ShopLayout } from "@/components/ShopLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { NoShopState } from "@/components/EmptyState";
import { useActiveShopId } from "@/lib/shop-context";
import { shopFullQuery, shopKeys } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/shop/notifications")({
  head: () => ({ meta: [{ title: "Notifications — FlowyBookings" }] }),
  component: NotificationsPage,
});

type ChannelKey = "email" | "sms" | "whatsapp";
type EventKey = "confirm" | "reminder24" | "reminder2" | "noshow";

type NotificationSettings = {
  channels: Record<ChannelKey, boolean>;
  events: Record<EventKey, boolean>;
};

const DEFAULTS: NotificationSettings = {
  channels: { email: true, sms: false, whatsapp: false },
  events: { confirm: true, reminder24: true, reminder2: true, noshow: false },
};

function readSettings(branding: unknown): NotificationSettings {
  const b = (branding ?? {}) as { notifications?: Partial<NotificationSettings> };
  return {
    channels: { ...DEFAULTS.channels, ...(b.notifications?.channels ?? {}) },
    events: { ...DEFAULTS.events, ...(b.notifications?.events ?? {}) },
  };
}

function NotificationsPage() {
  const shopId = useActiveShopId();
  const qc = useQueryClient();
  const { t } = useT();

  const { data: shop, isLoading } = useQuery({ ...shopFullQuery(shopId ?? ""), enabled: !!shopId });
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULTS);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (shop) {
      setSettings(readSettings(shop.branding));
      setDirty(false);
    }
  }, [shop]);

  const save = useMutation({
    mutationFn: async () => {
      if (!shopId || !shop) throw new Error("No active shop");
      const branding = { ...((shop.branding ?? {}) as Record<string, unknown>), notifications: settings };
      const { error } = await supabase.from("shops").update({ branding }).eq("id", shopId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("notifications.saved"));
      setDirty(false);
      if (shopId) qc.invalidateQueries({ queryKey: shopKeys.shopFull(shopId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const channels: { id: ChannelKey; nameKey: string; descKey: string; icon: typeof Mail; color: string }[] = [
    { id: "email", nameKey: "notifications.email", descKey: "notifications.emailDesc", icon: Mail, color: "bg-primary-soft text-primary" },
    { id: "sms", nameKey: "notifications.sms", descKey: "notifications.smsDesc", icon: Smartphone, color: "bg-peach text-peach-foreground" },
    { id: "whatsapp", nameKey: "notifications.whatsapp", descKey: "notifications.whatsappDesc", icon: MessageSquare, color: "bg-mint text-mint-foreground" },
  ];
  const events: { id: EventKey; titleKey: string; descKey: string }[] = [
    { id: "confirm", titleKey: "notifications.confirm", descKey: "notifications.confirmDesc" },
    { id: "reminder24", titleKey: "notifications.reminder24", descKey: "notifications.reminder24Desc" },
    { id: "reminder2", titleKey: "notifications.reminder2", descKey: "notifications.reminder2Desc" },
    { id: "noshow", titleKey: "notifications.noshow", descKey: "notifications.noshowDesc" },
  ];

  const toggleChannel = (k: ChannelKey) => { setSettings((s) => ({ ...s, channels: { ...s.channels, [k]: !s.channels[k] } })); setDirty(true); };
  const toggleEvent = (k: EventKey) => { setSettings((s) => ({ ...s, events: { ...s.events, [k]: !s.events[k] } })); setDirty(true); };

  return (
    <ShopLayout>
      <PageHeader title={t("notifications.title")} description={t("notifications.description")} />
      {!shopId ? <NoShopState /> : isLoading ? (
        <div className="h-72 animate-pulse rounded-2xl border border-border bg-card" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {channels.map((c) => {
              const Icon = c.icon;
              const on = settings.channels[c.id];
              return (
                <div key={c.id} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
                  <div className="flex items-center justify-between">
                    <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", c.color)}><Icon className="h-5 w-5" /></div>
                    <Toggle on={on} onChange={() => toggleChannel(c.id)} />
                  </div>
                  <h3 className="mt-3 font-semibold">{t(c.nameKey)}</h3>
                  <p className="text-xs text-muted-foreground">{t(c.descKey)}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-6 rounded-2xl border border-border bg-card shadow-soft">
            <div className="border-b border-border px-6 py-4">
              <h2 className="text-base font-semibold">{t("notifications.reminderEvents")}</h2>
              <p className="text-xs text-muted-foreground">{t("notifications.reminderDesc")}</p>
            </div>
            <div className="divide-y divide-border">
              {events.map((e) => {
                const on = settings.events[e.id];
                return (
                  <div key={e.id} className="flex items-center justify-between px-6 py-4">
                    <div>
                      <p className="font-medium">{t(e.titleKey)}</p>
                      <p className="text-xs text-muted-foreground">{t(e.descKey)}</p>
                    </div>
                    <Toggle on={on} onChange={() => toggleEvent(e.id)} />
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
              {dirty && <span className="text-xs text-muted-foreground">{t("notifications.unsaved")}</span>}
              <Button variant="hero" onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
                {save.isPending ? t("notifications.saving") : t("notifications.saveChanges")}
              </Button>
            </div>
          </div>
          <DepositSettings shopId={shopId} shop={shop} />
        </>
      )}
    </ShopLayout>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange} className={cn("relative inline-flex h-6 w-11 items-center rounded-full transition-colors", on ? "bg-primary" : "bg-muted")}>
      <span className={cn("inline-block h-5 w-5 transform rounded-full bg-card shadow transition-transform", on ? "translate-x-5" : "translate-x-0.5")} />
    </button>
  );
}

function DepositSettings({ shopId, shop }: { shopId: string; shop: { default_deposit_percent?: number | null } | null }) {
  const qc = useQueryClient();
  const { t } = useT();
  const [percent, setPercent] = useState<number>(0);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (shop) {
      setPercent(shop.default_deposit_percent ?? 0);
      setDirty(false);
    }
  }, [shop]);

  const save = useMutation({
    mutationFn: async () => {
      const safe = Math.max(0, Math.min(100, Math.round(percent)));
      const { error } = await supabase.from("shops").update({ default_deposit_percent: safe }).eq("id", shopId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("notifications.depositSaved"));
      setDirty(false);
      qc.invalidateQueries({ queryKey: shopKeys.shopFull(shopId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mt-6 rounded-2xl border border-border bg-card shadow-soft">
      <div className="border-b border-border px-6 py-4">
        <h2 className="text-base font-semibold">{t("notifications.depositTitle")}</h2>
        <p className="text-xs text-muted-foreground">{t("notifications.depositSub")}</p>
      </div>
      <div className="flex items-end gap-3 px-6 py-4">
        <div className="w-40">
          <label className="text-xs font-medium text-muted-foreground">{t("notifications.depositPercent")}</label>
          <input
            type="number"
            min={0}
            max={100}
            value={percent}
            onChange={(e) => { setPercent(Number(e.target.value)); setDirty(true); }}
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          />
        </div>
        <Button variant="outline" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? t("notifications.saving") : t("notifications.saveChanges")}
        </Button>
      </div>
    </div>
  );
}
