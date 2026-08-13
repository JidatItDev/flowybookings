// /shop/notifications — combines the Inbox (in-app messages) with Settings
// (channel + automation toggles). Mobile-app feel.

import { useEffect, useState } from "react";
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, Mail, MessageSquare, Plus, Settings as SettingsIcon, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { NoShopState } from "@/components/EmptyState";
// UpgradeNudge/PremiumBadge no longer needed: WhatsApp is uniformly "Coming soon".
import { NotificationsInbox } from "@/components/NotificationsInbox";
import { SmsTopUpDialog } from "@/components/SmsTopUpDialog";
import { FeatureLock } from "@/components/FeatureLock";
import { useActiveShopId, useShopContext } from "@/lib/shop-context";
import { shopFullQuery, shopKeys, shopAutomationsQuery, shopSmsCreditsQuery, SHOP_AUTOMATION_DEFAULTS, type ShopAutomationSettings } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { useFeatureAccess } from "@/lib/use-feature-access";
import { assertNotImpersonating, useImpersonationReadOnly } from "@/components/ImpersonationBanner";

type SearchParams = { topup?: "return" | "mock" | "cancel"; payment?: string };

export const Route = createFileRoute("/shop/notifications")({
  head: () => ({ meta: [{ title: "Notifications — FlowyBookings" }] }),
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    topup: s.topup === "return" || s.topup === "mock" || s.topup === "cancel" ? s.topup : undefined,
    payment: typeof s.payment === "string" ? s.payment : undefined,
  }),
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
  const { t } = useT();
  const [tab, setTab] = useState<"inbox" | "settings">("inbox");
  const search = useSearch({ from: "/shop/notifications" });
  const qc = useQueryClient();

  // After Mollie redirect, refresh credits + show toast.
  useEffect(() => {
    if (!shopId) return;
    if (search.topup === "return" || search.topup === "mock") {
      toast.success(t("smsTopup.successReturn"));
      qc.invalidateQueries({ queryKey: shopKeys.smsCredits(shopId) });
      // Also poll briefly: webhook may take a few seconds.
      const timer = setTimeout(() => {
        qc.invalidateQueries({ queryKey: shopKeys.smsCredits(shopId) });
      }, 3500);
      setTab("settings");
      return () => clearTimeout(timer);
    }
    if (search.topup === "cancel") {
      toast.error(t("smsTopup.failedReturn"));
      setTab("settings");
    }
  }, [search.topup, shopId, qc, t]);

  return (
    <>
      <PageHeader title={t("notifications.title")} description={t("inbox.pageDescription")} />
      {!shopId ? (
        <NoShopState />
      ) : (
        <>
          <div className="mb-4 inline-flex rounded-full border border-border bg-card p-1 shadow-soft">
            <TabButton active={tab === "inbox"} onClick={() => setTab("inbox")}>
              <Inbox className="h-4 w-4" /> {t("inbox.tabInbox")}
            </TabButton>
            <TabButton active={tab === "settings"} onClick={() => setTab("settings")}>
              <SettingsIcon className="h-4 w-4" /> {t("inbox.tabSettings")}
            </TabButton>
          </div>
          {tab === "inbox" ? <NotificationsInbox shopId={shopId} /> : <SettingsPanel shopId={shopId} />}
        </>
      )}
    </>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium transition-colors",
        active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function SettingsPanel({ shopId }: { shopId: string }) {
  const { activeShop } = useShopContext();
  const qc = useQueryClient();
  const { t } = useT();
  const readOnly = useImpersonationReadOnly();
  const readOnlyTitle = readOnly ? t("impersonate.readOnlyTooltip") : undefined;
  const isPremium = activeShop?.plan === "pro" || activeShop?.plan === "premium";

  const { data: shop, isLoading } = useQuery({ ...shopFullQuery(shopId), enabled: !!shopId });
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
      assertNotImpersonating();
      if (!shop) throw new Error(t("errors.noActiveShop"));
      const branding = { ...((shop.branding ?? {}) as Record<string, unknown>), notifications: settings };
      const { error } = await supabase.from("shops").update({ branding }).eq("id", shopId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("notifications.saved"));
      setDirty(false);
      qc.invalidateQueries({ queryKey: shopKeys.shopFull(shopId) });
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

  const toggleChannel = (k: ChannelKey) => {
    if (readOnly) return;
    setSettings((s) => ({ ...s, channels: { ...s.channels, [k]: !s.channels[k] } }));
    setDirty(true);
  };
  const toggleEvent = (k: EventKey) => {
    if (readOnly) return;
    setSettings((s) => ({ ...s, events: { ...s.events, [k]: !s.events[k] } }));
    setDirty(true);
  };

  if (isLoading) return <div className="h-72 animate-pulse rounded-2xl border border-border bg-card" />;

  return (
    <>
      {/* WhatsApp is niet beschikbaar — uitlegbanner i.p.v. een upgrade-CTA die nergens op uitkomt. */}
      <div className="mb-4 flex flex-wrap items-start gap-3 rounded-2xl border border-border bg-muted/30 p-4 text-xs">
        <MessageSquare className="mt-0.5 h-4 w-4 flex-none text-mint-foreground" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground">{t("notifications.whatsappComingTitle")}</p>
          <p className="mt-0.5 text-muted-foreground">{t("notifications.whatsappComingBody")}</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {channels.map((c) => {
          const Icon = c.icon;
          const on = settings.channels[c.id];
          // WhatsApp send-path is niet geïmplementeerd — toggle staat hard uit voor élk plan,
          // ongeacht of het abonnement de feature in theorie includeert. Voorkomt fake "aan"-state.
          const comingSoon = c.id === "whatsapp";
          const planLocked = c.id === "whatsapp" && !isPremium;
          return (
            <div key={c.id} className={cn("relative rounded-2xl border border-border bg-card p-5 shadow-soft", (comingSoon || planLocked) && "opacity-80")}>
              <div className="flex items-center justify-between">
                <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", c.color)}><Icon className="h-5 w-5" /></div>
                <Toggle on={on && !comingSoon && !planLocked} onChange={() => !comingSoon && !planLocked && toggleChannel(c.id)} disabled={readOnly || comingSoon || planLocked} title={comingSoon ? t("notifications.whatsappComingTitle") : readOnly ? readOnlyTitle : undefined} />
              </div>
              <h3 className="mt-3 flex items-center gap-2 font-semibold">
                {t(c.nameKey)}
                {comingSoon && (
                  <span className="rounded-full bg-mint/40 px-2 py-0.5 text-[10px] font-medium text-mint-foreground">
                    {t("notifications.whatsappBadge")}
                  </span>
                )}
              </h3>
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
                <Toggle on={on} onChange={() => toggleEvent(e.id)} disabled={readOnly} title={readOnlyTitle} />
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
          {dirty && <span className="text-xs text-muted-foreground">{t("notifications.unsaved")}</span>}
          <Button variant="hero" onClick={() => save.mutate()} disabled={!dirty || save.isPending || readOnly} title={readOnlyTitle}>
            {save.isPending ? t("notifications.saving") : t("notifications.saveChanges")}
          </Button>
        </div>
      </div>
      <AutomationSettings shopId={shopId} />
      <DepositSettings shopId={shopId} shop={shop ?? null} />
    </>
  );
}

function Toggle({ on, onChange, disabled, title }: { on: boolean; onChange: () => void; disabled?: boolean; title?: string }) {
  return (
    <button onClick={onChange} disabled={disabled} title={title} className={cn("relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50", on ? "bg-primary" : "bg-muted")}>
      <span className={cn("inline-block h-5 w-5 transform rounded-full bg-card shadow transition-transform", on ? "translate-x-5" : "translate-x-0.5")} />
    </button>
  );
}

function DepositSettings({ shopId, shop }: { shopId: string; shop: { default_deposit_percent?: number | null } | null }) {
  const qc = useQueryClient();
  const { t } = useT();
  const readOnly = useImpersonationReadOnly();
  const readOnlyTitle = readOnly ? t("impersonate.readOnlyTooltip") : undefined;
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
      assertNotImpersonating();
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
            disabled={readOnly}
            title={readOnlyTitle}
            onChange={(e) => { setPercent(Number(e.target.value)); setDirty(true); }}
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
        <Button variant="outline" disabled={!dirty || save.isPending || readOnly} title={readOnlyTitle} onClick={() => save.mutate()}>
          {save.isPending ? t("notifications.saving") : t("notifications.saveChanges")}
        </Button>
      </div>
    </div>
  );
}

type AutomationRow = ShopAutomationSettings;

const AUTO_DEFAULTS: AutomationRow = SHOP_AUTOMATION_DEFAULTS;

function AutomationSettings({ shopId }: { shopId: string }) {
  const qc = useQueryClient();
  const { t } = useT();
  const readOnly = useImpersonationReadOnly();
  const readOnlyTitle = readOnly ? t("impersonate.readOnlyTooltip") : undefined;
  const [row, setRow] = useState<AutomationRow>(AUTO_DEFAULTS);
  const [dirty, setDirty] = useState(false);
  const [topUpOpen, setTopUpOpen] = useState(false);

  const q = useQuery({ ...shopAutomationsQuery(shopId), enabled: !!shopId });
  const credits = useQuery({ ...shopSmsCreditsQuery(shopId), enabled: !!shopId });

  useEffect(() => {
    if (q.data) {
      setRow({ ...AUTO_DEFAULTS, ...q.data });
      setDirty(false);
    }
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      assertNotImpersonating();
      const { error } = await supabase
        .from("shop_automations")
        .upsert({ shop_id: shopId, ...row }, { onConflict: "shop_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("automations.saved"));
      setDirty(false);
      qc.invalidateQueries({ queryKey: shopKeys.automations(shopId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Feature gating: SMS reminders requires Starter+, WhatsApp requires Pro+
  const smsAccess = useFeatureAccess(shopId, "sms_reminders");
  const whatsappAccess = useFeatureAccess(shopId, "whatsapp_reminders");

  const items: { key: keyof AutomationRow; titleKey: string; descKey: string; locked?: boolean; lockLabel?: string; access?: typeof smsAccess.data }[] = [
    { key: "confirmation_enabled", titleKey: "automations.confirmation", descKey: "automations.confirmationDesc" },
    { key: "reminder_24h_enabled", titleKey: "automations.reminder24", descKey: "automations.reminder24Desc" },
    { key: "reminder_2h_enabled", titleKey: "automations.reminder2", descKey: "automations.reminder2Desc" },
    {
      key: "reminder_sms_enabled",
      titleKey: "automations.reminderSms",
      descKey: "automations.reminderSmsDesc",
      locked: smsAccess.data ? !smsAccess.data.allowed : false,
      lockLabel: t("feature.smsReminders"),
      access: smsAccess.data,
    },
    { key: "followup_enabled", titleKey: "automations.followup", descKey: "automations.followupDesc" },
  ];

  const balance = credits.data?.balance ?? 0;
  const balanceTone =
    balance === 0 ? "bg-destructive/15 text-destructive" :
    balance < 5 ? "bg-peach text-peach-foreground" :
    "bg-mint/40 text-mint-foreground";

  return (
    <>
      {/* SMS credits widget */}
      <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold">{t("automations.smsCreditsTitle")}</h3>
              <p className="text-xs text-muted-foreground">{t("automations.smsCreditsHint")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold", balanceTone)}>
              {balance}
            </span>
            <Button size="sm" variant="hero" onClick={() => setTopUpOpen(true)} disabled={readOnly} title={readOnlyTitle}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              {t("automations.smsCreditsTopUp")}
            </Button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl bg-muted/40 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t("automations.smsCreditsBalance")}</p>
            <p className="mt-0.5 text-base font-semibold">{balance}</p>
          </div>
          <div className="rounded-xl bg-muted/40 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t("automations.smsCreditsUsed")}</p>
            <p className="mt-0.5 text-base font-semibold">{credits.data?.total_used ?? 0}</p>
          </div>
          <div className="rounded-xl bg-muted/40 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t("automations.smsCreditsFree")}</p>
            <p className="mt-0.5 text-base font-semibold">{credits.data?.free_credits_granted ?? 0}</p>
          </div>
        </div>
        {balance === 0 && (
          <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{t("automations.smsCreditsEmpty")}</p>
        )}
        {balance > 0 && balance < 5 && (
          <p className="mt-3 rounded-lg bg-peach/30 px-3 py-2 text-xs text-peach-foreground">{t("automations.smsCreditsLow")}</p>
        )}
        <p className="mt-3 text-[11px] italic text-muted-foreground">{t("automations.smsProviderPending")}</p>
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-card shadow-soft">
        <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-4">
          <div>
            <h2 className="text-base font-semibold">{t("automations.title")}</h2>
            <p className="text-xs text-muted-foreground">{t("automations.sub")}</p>
          </div>
          <span className="rounded-full bg-mint/40 px-2.5 py-1 text-[11px] font-medium text-mint-foreground">
            {t("automations.statusActive")}
          </span>
        </div>
        <div className="divide-y divide-border">
          {items.map((it) => {
            if (it.locked && it.access) {
              return (
                <div key={it.key} className="px-6 py-4">
                  <FeatureLock access={it.access} featureLabel={it.lockLabel ?? t(it.titleKey)} mode="inline" />
                </div>
              );
            }
            return (
              <div key={it.key} className="flex items-center justify-between px-6 py-4">
                <div>
                  <p className="font-medium">{t(it.titleKey)}</p>
                  <p className="text-xs text-muted-foreground">{t(it.descKey)}</p>
                </div>
                <Toggle
                  on={row[it.key]}
                  onChange={() => { if (readOnly) return; setRow((r) => ({ ...r, [it.key]: !r[it.key] })); setDirty(true); }}
                  disabled={readOnly}
                  title={readOnlyTitle}
                />
              </div>
            );
          })}
          {/* WhatsApp herinneringen — send-path is nog niet geïmplementeerd.
              Toon één eerlijke "Binnenkort" rij voor alle plannen, zodat shops
              geen toggle zien die niets doet. Plan-gating blijft via DB intact. */}
          {whatsappAccess.data && (
            <div className="px-6 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{t("notifications.whatsappRowTitle")}</p>
                  <p className="text-xs text-muted-foreground">{t("notifications.whatsappRowDesc")}</p>
                </div>
                <span className="flex-none rounded-full bg-mint/40 px-2.5 py-1 text-[11px] font-medium text-mint-foreground">
                  {t("notifications.whatsappBadge")}
                </span>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-border px-6 py-4">
          <span className="text-[11px] text-muted-foreground">{t("automations.poweredBy")}</span>
          <Button variant="hero" onClick={() => save.mutate()} disabled={!dirty || save.isPending || readOnly} title={readOnlyTitle}>
            {save.isPending ? t("notifications.saving") : t("notifications.saveChanges")}
          </Button>
        </div>
      </div>

      <SmsTopUpDialog shopId={shopId} open={topUpOpen} onOpenChange={setTopUpOpen} />
    </>
  );
}
