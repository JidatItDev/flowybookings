import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Sparkles, ShieldCheck, TrendingUp, AlertTriangle, ArrowRight, Loader2, Lock } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShopLayout } from "@/components/ShopLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { changeShopPlan, tierOf, TIER_RANK, type DbPlan } from "@/lib/plans";
import { usePermissions } from "@/lib/use-permissions";
import { shopKeys } from "@/lib/queries";
import { ShopBillingCard, usePlanCheckout } from "@/components/ShopBillingCard";

export const Route = createFileRoute("/shop/upgrade")({
  head: () => ({ meta: [{ title: "Upgrade — FlowyBookings" }] }),
  component: UpgradePage,
});

type PlanKey = "starter" | "pro" | "premium"; // DB plan values for BASIC/PRO/PREMIUM tiers

function UpgradePage() {
  const { t } = useT();
  const { activeShop, user } = useAuth();
  const { canManageBilling, isStaffOnly } = usePermissions();
  const qc = useQueryClient();
  const currentPlan = (activeShop?.plan ?? "trial") as DbPlan;
  const currentTier = tierOf(currentPlan);

  const checkout = usePlanCheckout();

  // Downgrades don't require payment — keep them as direct plan changes.
  const downgrade = useMutation({
    mutationFn: async (newPlan: PlanKey) => {
      if (!activeShop) throw new Error("No active shop");
      await changeShopPlan({
        shopId: activeShop.id,
        newPlan,
        previousPlan: currentPlan,
        actorUserId: user?.id ?? null,
        actorEmail: user?.email ?? null,
        source: "owner_upgrade",
      });
    },
    onSuccess: async (_d, planKey) => {
      toast.success(t("upgrade.toastApplied", { plan: planKey }));
      if (activeShop) {
        try {
          await import("@/integrations/supabase/client").then(({ supabase }) =>
            supabase.from("notifications").insert({
              shop_id: activeShop.id,
              type: "billing",
              title: `Plan changed to ${planKey}`,
              message: `Your shop is now on the ${planKey} plan.`,
              action_url: "/shop/upgrade",
            }),
          );
        } catch {
          /* best-effort */
        }
      }
      qc.invalidateQueries({ queryKey: ["auth", "shops"] });
      if (activeShop) qc.invalidateQueries({ queryKey: shopKeys.shopFull(activeShop.id) });
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
      price: 19,
      accent: "neutral",
      features: [t("upgrade.feat.bookings"), t("upgrade.feat.staff3"), t("upgrade.feat.email"), t("upgrade.feat.analytics")],
    },
    {
      key: "pro",
      tier: "pro",
      name: t("upgrade.pro"),
      tagline: t("upgrade.proTagline"),
      price: 49,
      badge: t("upgrade.mostPopular"),
      accent: "primary",
      features: [t("upgrade.feat.bookings"), t("upgrade.feat.staff10"), t("upgrade.feat.sms"), t("upgrade.feat.deposits"), t("upgrade.feat.advAnalytics"), t("upgrade.feat.branding")],
    },
    {
      key: "premium",
      tier: "premium",
      name: t("upgrade.premium"),
      tagline: t("upgrade.premiumTagline"),
      price: 99,
      badge: t("upgrade.bestValue"),
      accent: "premium",
      features: [t("upgrade.feat.bookings"), t("upgrade.feat.staffUnlimited"), t("upgrade.feat.whatsapp"), t("upgrade.feat.multiloc"), t("upgrade.feat.priority"), t("upgrade.feat.api")],
    },
  ];

  if (isStaffOnly) {
    return (
      <ShopLayout>
        <PageHeader title={t("upgrade.pageTitle")} description={t("upgrade.pageSub")} />
        <div className="rounded-3xl border border-border bg-card p-8 text-center shadow-soft">
          <Lock className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-3 text-base font-semibold">{t("perm.staffNoBillingTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("perm.staffNoBillingDesc")}</p>
        </div>
      </ShopLayout>
    );
  }

  return (
    <ShopLayout>
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

      {/* Billing card (current plan, expiry, payment history, mock-confirm banner) */}
      <div className="mb-6">
        <ShopBillingCard />
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
                €{p.price}
                <span className="text-sm font-normal text-muted-foreground">{t("upgrade.perMonth")}</span>
              </p>

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
                disabled={isCurrent || busy || !canManageBilling}
                onClick={() => {
                  if (!canManageBilling) return;
                  if (isCurrent) return;
                  if (isDowngrade) {
                    if (!window.confirm(t("upgrade.confirmDowngrade", { plan: p.name }))) return;
                    downgrade.mutate(p.key);
                  } else {
                    // Real upgrade flow → Mollie checkout (or mock checkout in dev).
                    checkout.mutate({ plan: p.key, cycle: "monthly" });
                  }
                }}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {isCurrent
                  ? t("upgrade.currentPlan")
                  : isDowngrade
                  ? t("upgrade.cta.downgrade", { plan: p.name })
                  : t("upgrade.cta.upgrade", { plan: p.name })}
                {!isCurrent && !busy && <ArrowRight className="h-4 w-4" />}
              </Button>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">{t("upgrade.guarantee")}</p>
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
    </ShopLayout>
  );
}
