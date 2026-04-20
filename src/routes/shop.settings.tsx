import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CreditCard, Lock, Crown, Upload, X, AlertTriangle } from "lucide-react";
import { ShopLayout } from "@/components/ShopLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NoShopState } from "@/components/EmptyState";
import { MollieConnectCard } from "@/components/MollieConnectCard";
import { FeatureLock } from "@/components/FeatureLock";
import { useActiveShopId } from "@/lib/shop-context";
import { shopFullQuery, shopKeys } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { getTrialState } from "@/lib/trial";
import { useFeatureAccess } from "@/lib/use-feature-access";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/shop/settings")({
  head: () => ({ meta: [{ title: "Settings — FlowyBookings" }] }),
  component: SettingsPage,
});

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type DayKey = (typeof DAY_KEYS)[number];
type DayHours = { open: string; close: string; closed: boolean };
type BusinessHours = Record<DayKey, DayHours>;
type BookingRules = { minNoticeHours: number; maxWindowDays: number; slotIntervalMin: number; defaultDepositPct: number };
type Branding = { color?: string };

const DEFAULT_HOURS: BusinessHours = {
  mon: { open: "09:00", close: "18:00", closed: false },
  tue: { open: "09:00", close: "18:00", closed: false },
  wed: { open: "09:00", close: "18:00", closed: false },
  thu: { open: "09:00", close: "18:00", closed: false },
  fri: { open: "09:00", close: "18:00", closed: false },
  sat: { open: "10:00", close: "16:00", closed: false },
  sun: { open: "10:00", close: "16:00", closed: true },
};
const DEFAULT_RULES: BookingRules = { minNoticeHours: 2, maxWindowDays: 60, slotIntervalMin: 15, defaultDepositPct: 20 };

function SettingsPage() {
  const shopId = useActiveShopId();
  const qc = useQueryClient();
  const { t } = useT();
  const { refreshShops } = useAuth() as ReturnType<typeof useAuth> & { refreshShops?: () => void };
  const brandingAccess = useFeatureAccess(shopId, "custom_branding");
  const brandingAllowed = brandingAccess.data?.allowed ?? true;

  const { data: shop, isLoading } = useQuery({ ...shopFullQuery(shopId ?? ""), enabled: !!shopId });

  const [profile, setProfile] = useState({ name: "", phone: "", email: "", timezone: "Europe/Berlin", address: "" });
  const [branding, setBranding] = useState<Branding>({ color: "#7C5CFA" });
  const [hours, setHours] = useState<BusinessHours>(DEFAULT_HOURS);
  const [rules, setRules] = useState<BookingRules>(DEFAULT_RULES);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!shop) return;
    setProfile({ name: shop.name ?? "", phone: shop.phone ?? "", email: shop.email ?? "", timezone: shop.timezone ?? "Europe/Berlin", address: shop.address ?? "" });
    const b = (shop.branding ?? {}) as { color?: string; rules?: Partial<BookingRules> };
    setBranding({ color: b.color ?? "#7C5CFA" });
    setRules({ ...DEFAULT_RULES, ...(b.rules ?? {}) });
    const h = (shop.business_hours ?? {}) as Partial<BusinessHours>;
    setHours({ ...DEFAULT_HOURS, ...h });
    setDirty(false);
  }, [shop]);

  const save = useMutation({
    mutationFn: async () => {
      if (!shopId || !shop) throw new Error(t("errors.noActiveShop"));
      const newBranding = { ...((shop.branding ?? {}) as Record<string, unknown>), color: branding.color, rules };
      const payload = {
        name: profile.name.trim(),
        phone: profile.phone.trim() || null,
        email: profile.email.trim() || null,
        timezone: profile.timezone.trim() || "UTC",
        address: profile.address.trim() || null,
        branding: newBranding,
        business_hours: hours,
      };
      const { error } = await supabase.from("shops").update(payload).eq("id", shopId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("settings.saved"));
      setDirty(false);
      if (shopId) qc.invalidateQueries({ queryKey: shopKeys.shopFull(shopId) });
      qc.invalidateQueries({ queryKey: ["auth", "shops"] });
      refreshShops?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateProfile = <K extends keyof typeof profile>(k: K, v: string) => { setProfile((p) => ({ ...p, [k]: v })); setDirty(true); };
  const updateHours = (day: DayKey, patch: Partial<DayHours>) => { setHours((h) => ({ ...h, [day]: { ...h[day], ...patch } })); setDirty(true); };
  const updateRule = <K extends keyof BookingRules>(k: K, v: number) => { setRules((r) => ({ ...r, [k]: v })); setDirty(true); };

  const dayLabelKey: Record<DayKey, string> = { mon: "settings.monday", tue: "settings.tuesday", wed: "settings.wednesday", thu: "settings.thursday", fri: "settings.friday", sat: "settings.saturday", sun: "settings.sunday" };

  const planPrices: Record<string, { price: number; fee: number }> = {
    trial: { price: 0, fee: 0 },
    starter: { price: 19, fee: 1.5 },
    pro: { price: 49, fee: 1.0 },
    premium: { price: 99, fee: 0.5 },
  };
  const currentPlan = (shop?.plan ?? "trial") as keyof typeof planPrices;
  const planInfo = planPrices[currentPlan];
  const planExpiresAt = shop?.plan_expires_at ? new Date(shop.plan_expires_at) : null;
  const daysLeft = planExpiresAt ? Math.max(0, Math.ceil((planExpiresAt.getTime() - Date.now()) / 86400000)) : null;
  const planLabel = currentPlan === "trial" ? t("settings.planTrial") : (planExpiresAt && planExpiresAt < new Date()) ? t("settings.planExpired") : t("settings.planActive");

  return (
    <ShopLayout>
      <PageHeader
        title={t("settings.title")}
        description={t("settings.description")}
        actions={<Button variant="hero" onClick={() => save.mutate()} disabled={!dirty || save.isPending || !shopId}>{save.isPending ? t("settings.saving") : t("settings.saveChanges")}</Button>}
      />
      {!shopId ? <NoShopState /> : isLoading ? (
        <div className="h-72 animate-pulse rounded-2xl border border-border bg-card" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Trial-verlopen banner */}
          {(() => {
            const trial = getTrialState(shop as never);
            if (!trial.isExpired) return null;
            return (
              <div className="lg:col-span-3 flex flex-wrap items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-destructive">
                <AlertTriangle className="h-5 w-5 flex-none" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{t("settings.trialExpiredTitle")}</p>
                  <p className="mt-1 text-sm opacity-90">{t("settings.trialExpiredBody")}</p>
                </div>
                <Link to="/shop/upgrade"><Button variant="hero">{t("settings.trialExpiredCta")}</Button></Link>
              </div>
            );
          })()}

          {/* SECTIE 1 — Jouw abonnement */}
          <Card title={t("settings.subscription")} className="lg:col-span-3">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <Crown className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-lg font-semibold capitalize">{currentPlan}</p>
                    <span className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                      planLabel === t("settings.planActive") ? "bg-mint/40 text-mint-foreground" :
                      planLabel === t("settings.planTrial") ? "bg-peach text-peach-foreground" :
                      "bg-destructive/15 text-destructive",
                    )}>{planLabel}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    €{planInfo.price}/maand · {planInfo.fee}% platform fee
                  </p>
                  {planExpiresAt && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {currentPlan === "trial" && daysLeft !== null
                        ? t("settings.daysLeft", { n: String(daysLeft) })
                        : `${t("settings.nextPayment")}: ${planExpiresAt.toLocaleDateString("nl-NL", { day: "2-digit", month: "long", year: "numeric" })}`}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link to="/shop/upgrade"><Button variant="hero">{t("settings.changePlan")}</Button></Link>
                <Button variant="outline" disabled>{t("settings.cancelPlan")}</Button>
              </div>
            </div>
          </Card>

          {/* SECTIE 2 — Bedrijfsgegevens */}
          <Card title={t("settings.businessInfo")} className="lg:col-span-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("settings.shopName")} value={profile.name} onChange={(v) => updateProfile("name", v)} />
              <Field label={t("settings.phone")} value={profile.phone} onChange={(v) => updateProfile("phone", v)} />
              <Field label={t("settings.email")} value={profile.email} onChange={(v) => updateProfile("email", v)} />
              <Field label={t("settings.timezone")} value={profile.timezone} onChange={(v) => updateProfile("timezone", v)} />
              <div className="sm:col-span-2"><Field label={t("settings.address")} value={profile.address} onChange={(v) => updateProfile("address", v)} /></div>
              <div className="sm:col-span-2">
                <Label className="mb-1.5 flex items-center gap-2">
                  {t("settings.shopSlug")}
                  <Lock className="h-3 w-3 text-muted-foreground" />
                </Label>
                <Input value={shop?.slug ?? ""} disabled className="h-10 font-mono text-xs" />
                <p className="mt-1 text-xs text-muted-foreground">{t("settings.shopSlugHint")} · /book/{shop?.slug}</p>
              </div>
            </div>
          </Card>

          <Card title={t("settings.branding")}>
            {brandingAccess.data && !brandingAllowed ? (
              <FeatureLock
                access={brandingAccess.data}
                featureLabel={t("feature.customBranding")}
                mode="overlay"
              >
                <LogoUploader shopId={shopId!} currentLogoUrl={shop?.logo_url ?? null} fallbackInitials={(profile.name || "S").slice(0, 2).toUpperCase()} fallbackColor={branding.color ?? "var(--color-primary)"} disabled />
                <div className="mt-5">
                  <Label htmlFor="brand-color">{t("settings.brandColor")}</Label>
                  <div className="mt-1 flex items-center gap-2">
                    <input id="brand-color" type="color" value={branding.color ?? "#7C5CFA"} disabled className="h-10 w-12 cursor-not-allowed rounded-lg border border-border bg-background opacity-60" />
                    <Input value={branding.color ?? ""} disabled className="h-10 flex-1" />
                  </div>
                </div>
              </FeatureLock>
            ) : (
              <>
                <LogoUploader shopId={shopId!} currentLogoUrl={shop?.logo_url ?? null} fallbackInitials={(profile.name || "S").slice(0, 2).toUpperCase()} fallbackColor={branding.color ?? "var(--color-primary)"} />
                <div className="mt-5">
                  <Label htmlFor="brand-color">{t("settings.brandColor")}</Label>
                  <div className="mt-1 flex items-center gap-2">
                    <input id="brand-color" type="color" value={branding.color ?? "#7C5CFA"} onChange={(e) => { setBranding({ color: e.target.value }); setDirty(true); }} className="h-10 w-12 cursor-pointer rounded-lg border border-border bg-background" />
                    <Input value={branding.color ?? ""} onChange={(e) => { setBranding({ color: e.target.value }); setDirty(true); }} className="h-10 flex-1" />
                  </div>
                </div>
              </>
            )}
          </Card>

          <Card title={t("settings.businessHours")} className="lg:col-span-2">
            <div className="space-y-2">
              {DAY_KEYS.map((d) => (
                <div key={d} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
                  <span className="w-24 text-sm font-medium">{t(dayLabelKey[d])}</span>
                  {hours[d].closed ? (
                    <span className="text-xs text-muted-foreground">{t("settings.closed")}</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input type="time" value={hours[d].open} onChange={(e) => updateHours(d, { open: e.target.value })} className="h-8 rounded-lg border border-border bg-background px-2 text-xs" />
                      <span className="text-xs text-muted-foreground">—</span>
                      <input type="time" value={hours[d].close} onChange={(e) => updateHours(d, { close: e.target.value })} className="h-8 rounded-lg border border-border bg-background px-2 text-xs" />
                    </div>
                  )}
                  <button onClick={() => updateHours(d, { closed: !hours[d].closed })} className="rounded-lg border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted">
                    {hours[d].closed ? t("settings.markOpen") : t("settings.markClosed")}
                  </button>
                </div>
              ))}
            </div>
          </Card>

          <Card title={t("settings.bookingRules")}>
            <NumField label={t("settings.minNotice")} value={rules.minNoticeHours} onChange={(v) => updateRule("minNoticeHours", v)} />
            <div className="mt-3"><NumField label={t("settings.maxWindow")} value={rules.maxWindowDays} onChange={(v) => updateRule("maxWindowDays", v)} /></div>
            <div className="mt-3"><NumField label={t("settings.slotInterval")} value={rules.slotIntervalMin} onChange={(v) => updateRule("slotIntervalMin", v)} /></div>
            <div className="mt-3"><NumField label={t("settings.defaultDeposit")} value={rules.defaultDepositPct} onChange={(v) => updateRule("defaultDepositPct", v)} /></div>
          </Card>

          {/* SECTIE — Betalingen van klanten */}
          <div className="lg:col-span-3">
            <h2 className="mb-3 text-base font-semibold">{t("settings.customerPayments")}</h2>
            <p className="mb-4 text-xs text-muted-foreground">{t("settings.platformFee", { pct: String(planInfo.fee) })} {currentPlan !== "premium" && `· ${t("settings.upgradeFee")}`}</p>
            <MollieConnectCard shopId={shopId} />
          </div>

          {/* Stripe placeholder */}
          <div className="lg:col-span-3">
            <div className="rounded-2xl border border-border border-dashed bg-card p-4 shadow-soft sm:p-6 opacity-75">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-muted text-muted-foreground">
                    <CreditCard className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold">{t("settings.stripeTitle")}</h3>
                    <p className="text-xs text-muted-foreground sm:text-sm">{t("settings.stripeDesc")}</p>
                  </div>
                </div>
                <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  {t("settings.stripeComingSoon")}
                </span>
              </div>
              <Button disabled variant="outline" className="mt-4">
                {t("settings.stripeComingSoon")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ShopLayout>
  );
}

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-border bg-card p-6 shadow-soft ${className}`}><h2 className="mb-4 text-base font-semibold">{title}</h2>{children}</div>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="mb-1.5 block">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-10" />
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <Label className="mb-1.5 block">{label}</Label>
      <Input type="number" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} className="h-10" />
    </div>
  );
}

function LogoUploader({ shopId, currentLogoUrl, fallbackInitials, fallbackColor, disabled = false }: { shopId: string; currentLogoUrl: string | null; fallbackInitials: string; fallbackColor: string; disabled?: boolean }) {
  const qc = useQueryClient();
  const { t } = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    if (!shopId) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error(t("settings.logoTooLarge"));
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
      const path = `${shopId}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("shop-logos").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("shop-logos").getPublicUrl(path);
      const { error: updErr } = await supabase.from("shops").update({ logo_url: pub.publicUrl }).eq("id", shopId);
      if (updErr) throw updErr;
      toast.success(t("settings.logoUploaded"));
      qc.invalidateQueries({ queryKey: shopKeys.shopFull(shopId) });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async () => {
    if (!shopId) return;
    setUploading(true);
    try {
      const { error } = await supabase.from("shops").update({ logo_url: null }).eq("id", shopId);
      if (error) throw error;
      toast.success(t("settings.logoRemoved"));
      qc.invalidateQueries({ queryKey: shopKeys.shopFull(shopId) });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      {currentLogoUrl ? (
        <img src={currentLogoUrl} alt="Shop logo" className="h-16 w-16 rounded-2xl object-cover border border-border" />
      ) : (
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl text-xl font-semibold text-primary-foreground" style={{ background: fallbackColor }}>
          {fallbackInitials}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{t("settings.logoUploaderHint")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }}
            disabled={disabled}
          />
          <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading || disabled}>
            <Upload className="h-4 w-4" /> {uploading ? t("settings.logoUploadingShort") : currentLogoUrl ? t("settings.logoReplace") : t("settings.logoUpload")}
          </Button>
          {currentLogoUrl && (
            <Button variant="ghost" size="sm" onClick={remove} disabled={uploading || disabled} className="text-destructive">
              <X className="h-4 w-4" /> {t("settings.logoRemove")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
