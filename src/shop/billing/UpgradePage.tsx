import { useEffect, useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Check, Sparkles, ShieldCheck, TrendingUp, AlertTriangle, ArrowRight, Loader2, Lock } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/shared/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/lib/auth-context";
import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { tierOf, TIER_RANK, type DbPlan } from "@/shared/lib/plans";
import { usePermissions } from "@/shop/billing/use-permissions";
import { shopKeys } from "@/shop/shared/queries-barrel";
import { ShopBillingCard, usePlanCheckout } from "@/shop/billing/ShopBillingCard";
import { clearBillingPending } from "@/shop/billing/use-pending-billing";
import { TransactionFeesCard } from "@/shop/billing/TransactionFeesCard";
import { assertNotImpersonating, useImpersonationReadOnly } from "@/admin/impersonation/ImpersonationBanner";
import { usePlanPricing, planMonthlyAmount } from "@/shop/billing/use-plan-pricing";

type PlanKey = "starter" | "pro" | "premium"; // DB plan values for BASIC/PRO/PREMIUM tiers

export function UpgradePage() {
  const { t } = useT();
  const { activeShop, refreshShops } = useAuth() as ReturnType<typeof useAuth> & { refreshShops?: () => void };
  const { canManageBilling, isStaffOnly } = usePermissions();
  const qc = useQueryClient();
  const currentPlan = (activeShop?.plan ?? "trial") as DbPlan;
  const currentTier = tierOf(currentPlan);
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const readOnly = useImpersonationReadOnly();
  const readOnlyTitle = readOnly ? t("impersonate.readOnlyTooltip") : undefined;
  const search = useSearch({ strict: false }) as { billing?: string; payment?: string };
  const navigate = useNavigate();
  const { data: pricingMap } = usePlanPricing();
  const priceFor = (plan: DbPlan, fallback: number) => planMonthlyAmount(pricingMap, plan) ?? fallback;

  const checkout = usePlanCheckout();

  // After Mollie redirect, sync payment status from Mollie (webhooks are often
  // delayed or blocked on ngrok). Then refetch shops so the plan badge updates.
  useEffect(() => {
    if (!search.billing || !activeShop?.id) return;
    const paymentId = search.payment;
    let cancelled = false;
    (async () => {
      if (search.billing === "success" && paymentId) {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (token) {
          const res = await fetch("/api/billing/plan-sync", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ payment_id: paymentId }),
          });
          const data = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            local_status?: string;
            mollie_status?: string;
            plan?: string;
          };
          if (cancelled) return;
          if (data.local_status === "paid") {
            clearBillingPending();
            toast.success(t("upgrade.toastUpgraded", { plan: data.plan ?? activeShop.plan ?? "" }));
          } else if (data.mollie_status === "failed") {
            clearBillingPending();
            toast.error("Payment failed. Your current plan is unchanged.");
          } else {
            // canceled / expired / open / pending / unpaid — Mollie cancel and browser-back
            // often return with status still "open". Do not resume that payment.
            clearBillingPending();
            toast.message("Checkout was not completed. Your current plan is unchanged.");
          }
        }
      } else if (search.billing === "success") {
        toast.success(t("upgrade.toastUpgraded", { plan: activeShop?.plan ?? "" }));
      }
      if (cancelled) return;
      qc.invalidateQueries({ queryKey: ["auth", "shops"] });
      qc.invalidateQueries({ queryKey: ["shop", "billing-payments", activeShop.id] });
      qc.invalidateQueries({ queryKey: shopKeys.shopFull(activeShop.id) });
      refreshShops?.();
      navigate({ to: "/shop/billing", search: {}, replace: true });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.billing, search.payment, activeShop?.id]);

  // Downgrades are scheduled at period end — never write shops.plan from the client.
  const downgrade = useMutation({
    mutationFn: async (newPlan: PlanKey) => {
      assertNotImpersonating();
      if (!activeShop) throw new Error("No active shop");
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not signed in");
      const res = await fetch("/api/billing/plan-downgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ shop_id: activeShop.id, target_plan: newPlan, cycle }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "downgrade_failed");
      }
    },
    onSuccess: async (_d, planKey) => {
      toast.success(t("upgrade.toastDowngradeScheduled", { plan: planKey }));
      qc.invalidateQueries({ queryKey: ["auth", "shops"] });
      if (activeShop) qc.invalidateQueries({ queryKey: shopKeys.shopFull(activeShop.id) });
      refreshShops?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const plans: Array<{
    key: PlanKey;
    tier: "basic" | "pro" | "premium";
    name: string;
    tagline: string;
    price: number;
    badge?: string;
    accent: "neutral" | "primary" | "premium";
    features: string[];
  }> = [
    {
      key: "starter",
      tier: "basic",
      name: t("upgrade.basic"),
      tagline: t("upgrade.basicTagline"),
      price: priceFor("starter", 19),
      accent: "neutral",
      features: [t("upgrade.feat.bookings"), t("upgrade.feat.staff3"), t("upgrade.feat.email"), t("upgrade.feat.analytics")],
    },
    {
      key: "pro",
      tier: "pro",
      name: t("upgrade.pro"),
      tagline: t("upgrade.proTagline"),
      price: priceFor("pro", 49),
      badge: t("upgrade.mostPopular"),
      accent: "primary",
      features: [t("upgrade.feat.bookings"), t("upgrade.feat.staff10"), t("upgrade.feat.sms"), t("upgrade.feat.deposits"), t("upgrade.feat.advAnalytics"), t("upgrade.feat.branding")],
    },
    {
      key: "premium",
      tier: "premium",
      name: t("upgrade.premium"),
      tagline: t("upgrade.premiumTagline"),
      price: priceFor("premium", 99),
      badge: t("upgrade.bestValue"),
      accent: "premium",
      features: [t("upgrade.feat.bookings"), t("upgrade.feat.staffUnlimited"), t("upgrade.feat.whatsapp"), t("upgrade.feat.multiloc"), t("upgrade.feat.priority"), t("upgrade.feat.api")],
    },
  ];

  if (isStaffOnly) {
    return (
      <>
        <PageHeader title={t("upgrade.pageTitle")} description={t("upgrade.pageSub")} />
        <div className="rounded-3xl border border-border bg-card p-8 text-center shadow-soft">
          <Lock className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-3 text-base font-semibold">{t("perm.staffNoBillingTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("perm.staffNoBillingDesc")}</p>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title={t("upgrade.pageTitle")} description={t("upgrade.pageSub")} />

      {/* Current plan summary */}
      <div className="mb-4 rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{t("upgrade.youAreOn")}</p>
            <p className="truncate text-sm font-semibold capitalize">{currentPlan}</p>
          </div>
          <span className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary capitalize">
            {currentTier}
          </span>
        </div>
      </div>

      {/* Outcomes strip */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {[
          { icon: TrendingUp, label: t("upgrade.outcomeBookings"), bg: "bg-mint", fg: "text-mint-foreground" },
          { icon: ShieldCheck, label: t("upgrade.outcomeNoShows"), bg: "bg-primary-soft", fg: "text-primary" },
          { icon: Sparkles, label: t("upgrade.outcomeRevenue"), bg: "bg-peach", fg: "text-peach-foreground" },
        ].map(({ icon: Icon, label, bg, fg }) => (
          <div key={label} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
            <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", bg, fg)}>
              <Icon className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium">{label}</p>
          </div>
        ))}
      </div>

      {/* Billing card (current plan, expiry, payment history) */}
      <div className="mb-6">
        <ShopBillingCard />
      </div>

      {/* Transparency: per-booking transaction fees for the current plan */}
      <div className="mb-6">
        <TransactionFeesCard />
      </div>

      {/* Billing cycle toggle */}
      <div className="mb-5 flex items-center justify-center">
        <div role="tablist" aria-label="Billing cycle" className="inline-flex rounded-full border border-border bg-card p-1 shadow-soft">
          <button
            role="tab"
            aria-selected={cycle === "monthly"}
            onClick={() => setCycle("monthly")}
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-semibold transition-colors",
              cycle === "monthly" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t("upgrade.cycle.monthly")}
          </button>
          <button
            role="tab"
            aria-selected={cycle === "yearly"}
            onClick={() => setCycle("yearly")}
            className={cn(
              "ml-1 inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors",
              cycle === "yearly" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t("upgrade.cycle.yearly")}
            <span className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
              cycle === "yearly" ? "bg-primary-foreground/20 text-primary-foreground" : "bg-mint text-mint-foreground",
            )}>
              {t("upgrade.cycle.save")}
            </span>
          </button>
        </div>
      </div>

      {/* Plans */}
      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((p) => {
          const isCurrent = currentPlan === p.key;
          const isDowngrade = TIER_RANK[p.tier] < TIER_RANK[currentTier] && !isCurrent;
          const featured = p.accent === "primary";
          const busy =
            (checkout.isPending && checkout.variables?.plan === p.key) ||
            (downgrade.isPending && downgrade.variables === p.key);
          return (
            <div
              key={p.key}
              className={cn(
                "relative flex flex-col rounded-3xl border bg-card p-6 shadow-soft",
                featured && "border-primary ring-2 ring-primary/20",
                p.accent === "premium" && "border-foreground/20",
                p.accent === "neutral" && "border-border",
              )}
            >
              {p.badge && (
                <span className={cn("absolute -top-3 left-6 rounded-full px-3 py-1 text-xs font-semibold", featured ? "bg-gradient-brand text-primary-foreground" : "bg-foreground text-background")}>
                  {p.badge}
                </span>
              )}
              {isCurrent && (
                <span className="absolute -top-3 right-6 rounded-full bg-success px-3 py-1 text-xs font-semibold text-success-foreground">
                  {t("upgrade.currentPlan")}
                </span>
              )}

              <h3 className="text-base font-semibold">{p.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{p.tagline}</p>

              <p className="mt-4 text-4xl font-semibold tracking-tight">
                €{cycle === "yearly" ? p.price * 10 : p.price}
                <span className="text-sm font-normal text-muted-foreground">
                  {cycle === "yearly" ? t("upgrade.perYear") : t("upgrade.perMonth")}
                </span>
              </p>
              {cycle === "yearly" && (
                <p className="mt-1 text-xs font-medium text-success-foreground">
                  {t("upgrade.cycle.savingHint", { months: 2 })}
                </p>
              )}

              <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success-foreground" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Button
                variant={featured ? "hero" : isCurrent ? "outline" : "default"}
                className="mt-6 w-full"
                size="lg"
                disabled={isCurrent || busy || !canManageBilling || readOnly}
                title={readOnlyTitle}
                onClick={() => {
                  if (!canManageBilling || readOnly) return;
                  if (isCurrent) return;
                  if (isDowngrade) {
                    if (!window.confirm(t("upgrade.confirmDowngrade", { plan: p.name }))) return;
                    downgrade.mutate(p.key);
                  } else {
                    // Upgrade tijdens trial: laat duidelijk weten dat de trial direct stopt.
                    if (currentPlan === "trial") {
                      if (!window.confirm(t("upgrade.confirmUpgradeFromTrial"))) return;
                    }
                    checkout.mutate({ plan: p.key, cycle });
                  }
                }}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {isCurrent
                  ? t("upgrade.currentPlan")
                  : isDowngrade
                  ? t("upgrade.cta.downgrade", { plan: p.name })
                  : p.key === "premium"
                  ? t("upgrade.cta.upgradePremium")
                  : t("upgrade.cta.upgradeShort", { plan: p.name })}
                {!isCurrent && !busy && <ArrowRight className="h-4 w-4" />}
              </Button>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">{t("upgrade.guarantee")}</p>
      <p className="mt-2 text-center text-xs text-muted-foreground">{t("upgrade.instantNote")}</p>
      <p className="mt-2 text-center text-xs text-muted-foreground">{t("upgrade.billingNotice")}</p>

      {/* FAQ */}
      <div className="mt-10 rounded-3xl border border-border bg-card p-6 shadow-soft">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <AlertTriangle className="h-4 w-4 text-muted-foreground" /> {t("upgrade.faqTitle")}
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {[
            { q: t("upgrade.faq1q"), a: t("upgrade.faq1a") },
            { q: t("upgrade.faq2q"), a: t("upgrade.faq2a") },
            { q: t("upgrade.faq3q"), a: t("upgrade.faq3a") },
          ].map((f) => (
            <div key={f.q}>
              <p className="text-sm font-medium">{f.q}</p>
              <p className="mt-1 text-sm text-muted-foreground">{f.a}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
