import { createFileRoute } from "@tanstack/react-router";
import { Check, Sparkles, ShieldCheck, TrendingUp, AlertTriangle, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { ShopLayout } from "@/components/ShopLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useShopContext } from "@/lib/shop-context";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/shop/upgrade")({
  head: () => ({ meta: [{ title: "Upgrade — FlowyBookings" }] }),
  component: UpgradePage,
});

type PlanKey = "starter" | "pro" | "premium";

function UpgradePage() {
  const { t } = useT();
  const { activeShop } = useShopContext();
  const currentPlan = (activeShop?.plan ?? "trial") as string;

  const plans: Array<{
    key: PlanKey;
    name: string;
    tagline: string;
    price: number;
    badge?: string;
    accent: "neutral" | "primary" | "premium";
    features: string[];
  }> = [
    {
      key: "starter",
      name: t("upgrade.basic"),
      tagline: t("upgrade.basicTagline"),
      price: 19,
      accent: "neutral",
      features: [
        t("upgrade.feat.bookings"),
        t("upgrade.feat.staff3"),
        t("upgrade.feat.email"),
        t("upgrade.feat.analytics"),
      ],
    },
    {
      key: "pro",
      name: t("upgrade.pro"),
      tagline: t("upgrade.proTagline"),
      price: 49,
      badge: t("upgrade.mostPopular"),
      accent: "primary",
      features: [
        t("upgrade.feat.bookings"),
        t("upgrade.feat.staff10"),
        t("upgrade.feat.sms"),
        t("upgrade.feat.deposits"),
        t("upgrade.feat.advAnalytics"),
        t("upgrade.feat.branding"),
      ],
    },
    {
      key: "premium",
      name: t("upgrade.premium"),
      tagline: t("upgrade.premiumTagline"),
      price: 99,
      badge: t("upgrade.bestValue"),
      accent: "premium",
      features: [
        t("upgrade.feat.bookings"),
        t("upgrade.feat.staffUnlimited"),
        t("upgrade.feat.whatsapp"),
        t("upgrade.feat.multiloc"),
        t("upgrade.feat.priority"),
        t("upgrade.feat.api"),
      ],
    },
  ];

  const handleSelect = (planKey: PlanKey) => {
    if (planKey === currentPlan) return;
    toast.success(t("upgrade.toastSoon"));
  };

  return (
    <ShopLayout>
      <PageHeader title={t("upgrade.pageTitle")} description={t("upgrade.pageSub")} />

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

      {/* Plans */}
      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((p) => {
          const isCurrent = currentPlan === p.key;
          const featured = p.accent === "primary";
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
                <span
                  className={cn(
                    "absolute -top-3 left-6 rounded-full px-3 py-1 text-xs font-semibold",
                    featured ? "bg-gradient-brand text-primary-foreground" : "bg-foreground text-background",
                  )}
                >
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
                disabled={isCurrent}
                onClick={() => handleSelect(p.key)}
              >
                {isCurrent
                  ? t("upgrade.currentPlan")
                  : p.key === "starter"
                  ? t("upgrade.cta.starter")
                  : t("upgrade.cta.upgrade", { plan: p.name })}
                {!isCurrent && <ArrowRight className="h-4 w-4" />}
              </Button>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">{t("upgrade.guarantee")}</p>

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
