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
import { BookingLinkCard } from "@/components/BookingLinkCard";
import { MollieConnectCard } from "@/components/MollieConnectCard";
import { useImpersonationReadOnly, assertNotImpersonating } from "@/components/ImpersonationBanner";
import { FeatureLock } from "@/components/FeatureLock";
import { useActiveShopId } from "@/lib/shop-context";
import { shopFullQuery, shopKeys } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { getTrialState } from "@/lib/trial";
import { planLabel as planLabelFn } from "@/lib/plans";
import { useFeatureAccess } from "@/lib/use-feature-access";
import { usePlanPricing, formatPlanPrice } from "@/lib/use-plan-pricing";
import { usePendingBilling } from "@/lib/use-pending-billing";
import { useSearch, useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/shop/settings")({
  head: () => ({ meta: [{ title: "Settings — FlowyBookings" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    billing: typeof search.billing === "string" ? (search.billing as string) : undefined,
    payment: typeof search.payment === "string" ? (search.payment as string) : undefined,
  }),
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
  const readOnly = useImpersonationReadOnly();
  const roTitle = readOnly ? t("impersonate.readOnlyTooltip") : undefined;
  const { activeShop, refreshShops } = useAuth() as ReturnType<typeof useAuth> & { refreshShops?: () => void };
  const brandingAccess = useFeatureAccess(shopId, "custom_branding");
  const brandingAllowed = brandingAccess.data?.allowed ?? true;
  const search = Route.useSearch();
  const navigate = useNavigate();

  const { data: shop, isLoading } = useQuery({ ...shopFullQuery(shopId ?? ""), enabled: !!shopId });

  // After returning from Mollie checkout (?billing=success|mock), do ONE
  // refetch of the auth-shops + shopFull caches and rely on the webhook to
  // finalize the DB. The optimistic "Activatie loopt…" badge (driven by the
  // sessionStorage flag set during checkout) bridges the gap until the webhook
  // arrives — no fragile timed polling loop.
  useEffect(() => {
    if (!search.billing || !shopId) return;
    qc.invalidateQueries({ queryKey: ["auth", "shops"] });
    qc.invalidateQueries({ queryKey: shopKeys.shopFull(shopId) });
    refreshShops?.();
    navigate({ to: "/shop/settings", search: {}, replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.billing, shopId]);

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
      assertNotImpersonating();
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

  // SINGLE SOURCE OF TRUTH for plan + status: useAuth().activeShop, the same
  // row that drives the header badge + TrialBanner. Falls back to the freshly
  // fetched shopFullQuery row if activeShop hasn't hydrated yet.
  // Status semantics come from getTrialState(), which reads:
  //   - shop.plan / shop.plan_expires_at  (trial vs paid + expiry)
  //   - shop.onboarding.subscription_status / payment_failed_at  (Mollie webhook)
  // Pricing comes from the DB (plan_pricing) via usePlanPricing — never inline.
  const planSource = (activeShop ?? (shop as unknown as typeof activeShop)) ?? null;
  const trialState = getTrialState(planSource as never);
  const currentPlan = (planSource?.plan ?? "trial") as string;
  const planNameLabel = planLabelFn(currentPlan);
  const { data: pricing } = usePlanPricing();
  const planPrice = formatPlanPrice(pricing, currentPlan);
  const planExpiresAt = planSource?.plan_expires_at ? new Date(planSource.plan_expires_at) : null;

  // Optimistic "pending" while a Mollie upgrade is in flight.
  const pendingBilling = usePendingBilling();
  const isPending = !!(pendingBilling && planSource?.id === pendingBilling.shopId && currentPlan !== pendingBilling.plan);

  // Per-status badge label + tone. Always derived from the same trialState — no
  // separate booleans that can drift apart from the header.
  const statusBadge: { label: string; tone: "mint" | "peach" | "destructive" | "muted" | "primary" } = (() => {
    if (isPending)                                           return { label: t("billing.statusPending"),       tone: "primary" };
    if (trialState.isTrial && trialState.isExpired)         return { label: t("settings.planExpired"),        tone: "destructive" };
    if (trialState.isTrial)                                  return { label: t("settings.planTrial"),          tone: "peach" };
    if (trialState.subscriptionStatus === "payment_failed") return { label: t("billing.statusPaymentFailed"), tone: "destructive" };
    if (trialState.subscriptionStatus === "cancelled")      return { label: t("billing.statusCancelled"),     tone: "muted" };
    if (trialState.subscriptionStatus === "expired")        return { label: t("settings.planExpired"),        tone: "destructive" };
    return { label: t("settings.planActive"), tone: "mint" };
  })();
  const toneClasses: Record<typeof statusBadge.tone, string> = {
    mint: "bg-mint/40 text-mint-foreground",
    peach: "bg-peach text-peach-foreground",
    destructive: "bg-destructive/15 text-destructive",
    muted: "bg-muted text-muted-foreground",
    primary: "bg-primary-soft text-primary",
  };

  return (
    <ShopLayout>
      <PageHeader
        title={t("settings.title")}
        description={t("settings.description")}
        actions={<Button variant="hero" onClick={() => save.mutate()} disabled={!dirty || save.isPending || !shopId || readOnly} title={roTitle}>{save.isPending ? t("settings.saving") : t("settings.saveChanges")}</Button>}
      />
      {!shopId ? <NoShopState /> : isLoading ? (
        <div className="h-72 animate-pulse rounded-2xl border border-border bg-card" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Trial-verlopen banner — same trialState as the badge below */}
          {trialState.isExpired && (
            <div className="lg:col-span-3 flex flex-wrap items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-destructive">
              <AlertTriangle className="h-5 w-5 flex-none" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{t("settings.trialExpiredTitle")}</p>
                <p className="mt-1 text-sm opacity-90">{t("settings.trialExpiredBody")}</p>
              </div>
              <Link to="/shop/upgrade"><Button variant="hero">{t("settings.trialExpiredCta")}</Button></Link>
            </div>
          )}

          {/* SECTIE 1 — Jouw abonnement (single source of truth: activeShop) */}
          <Card title={t("settings.subscription")} className="lg:col-span-3">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <Crown className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-lg font-semibold">{planNameLabel}</p>
                    <span className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                      toneClasses[statusBadge.tone],
                    )}>{statusBadge.label}</span>
                  </div>
                  {planPrice && !trialState.isTrial && (
                    <p className="mt-1 text-sm text-muted-foreground">{planPrice}</p>
                  )}
                  {planExpiresAt && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {trialState.isTrial && trialState.daysLeft !== null
                        ? t("settings.daysLeft", { n: String(trialState.daysLeft) })
                        : `${t("settings.nextPayment")}: ${planExpiresAt.toLocaleDateString("nl-NL", { day: "2-digit", month: "long", year: "numeric" })}`}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link to="/shop/upgrade"><Button variant="hero">{t("settings.changePlan")}</Button></Link>
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
                <p className="mt-1 text-xs text-muted-foreground">{t("settings.shopSlugHint")}</p>
              </div>
              <div className="sm:col-span-2">
                <Label className="mb-1.5 block">{t("bookingLink.title")}</Label>
                <BookingLinkCard slug={shop?.slug ?? null} shopName={shop?.name} logoUrl={shop?.logo_url ?? null} compact />
              </div>
            </div>
          </Card>

          <Card title={t("settings.branding")}>
            {brandingAccess.data && !brandingAllowed ? (
              // Wrap in a relative container with explicit min-height so the
              // FeatureLock overlay (absolute inset-0) is fully contained inside
              // the card on every breakpoint and never floats over neighbours.
              <div className="relative min-h-[260px]">
                <FeatureLock
                  access={brandingAccess.data}
                  featureLabel={t("feature.customBranding")}
                  mode="overlay"
                >
                  <div className="space-y-5">
                    <LogoUploader shopId={shopId!} currentLogoUrl={shop?.logo_url ?? null} fallbackInitials={(profile.name || "S").slice(0, 2).toUpperCase()} fallbackColor={branding.color ?? "var(--color-primary)"} disabled />
                    <div>
                      <Label htmlFor="brand-color">{t("settings.brandColor")}</Label>
                      <div className="mt-1 flex items-center gap-2">
                        <input id="brand-color" type="color" value={branding.color ?? "#7C5CFA"} disabled className="h-10 w-12 cursor-not-allowed rounded-lg border border-border bg-background opacity-60" />
                        <Input value={branding.color ?? ""} disabled className="h-10 flex-1" />
                      </div>
                    </div>
                  </div>
                </FeatureLock>
              </div>
            ) : (
              <div className="space-y-5">
                <LogoUploader shopId={shopId!} currentLogoUrl={shop?.logo_url ?? null} fallbackInitials={(profile.name || "S").slice(0, 2).toUpperCase()} fallbackColor={branding.color ?? "var(--color-primary)"} />
                <div>
                  <Label htmlFor="brand-color">{t("settings.brandColor")}</Label>
                  <div className="mt-1 flex items-center gap-2">
                    <input id="brand-color" type="color" value={branding.color ?? "#7C5CFA"} onChange={(e) => { setBranding({ color: e.target.value }); setDirty(true); }} className="h-10 w-12 cursor-pointer rounded-lg border border-border bg-background" />
                    <Input value={branding.color ?? ""} onChange={(e) => { setBranding({ color: e.target.value }); setDirty(true); }} className="h-10 flex-1" />
                  </div>
                </div>
              </div>
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

          {/* SECTIE — Betalingen van klanten. Platform fee mirrors DB plan_pricing defaults. */}
          {(() => {
            const PLATFORM_FEE_PCT: Record<string, number> = { trial: 0, starter: 1.5, pro: 1.0, premium: 0.5 };
            const fee = PLATFORM_FEE_PCT[currentPlan] ?? 0;
            return (
              <div className="lg:col-span-3">
                <h2 className="mb-3 text-base font-semibold">{t("settings.customerPayments")}</h2>
                <p className="mb-4 text-xs text-muted-foreground">{t("settings.platformFee", { pct: String(fee) })} {currentPlan !== "premium" && `· ${t("settings.upgradeFee")}`}</p>
                <MollieConnectCard shopId={shopId} />
              </div>
            );
          })()}

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
