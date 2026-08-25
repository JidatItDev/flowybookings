// Soft-lock overlay used to gate features that require a higher plan.
// Renders the children visually disabled, with a centered upgrade CTA on top.
// When `mode="inline"` it renders a compact horizontal lock notice instead of an overlay.

import { Link } from "@tanstack/react-router";
import { Lock, ArrowRight, AlertTriangle } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/components/ui/button";
import { useT } from "@/shared/lib/i18n";
import {
  type FeatureAccess,
  planPriceLabel,
  usagePercentage,
} from "@/shop/billing/use-feature-access";

type Props = {
  access: FeatureAccess | undefined;
  /** Human-readable label for the locked feature, e.g. "SMS herinneringen". Prefer passing a translated string. */
  featureLabel: string;
  /** Visual: overlay over greyed children, or compact inline notice with no children. */
  mode?: "overlay" | "inline";
  /** Where the upgrade CTA links to. */
  upgradeHref?: string;
  children?: React.ReactNode;
  className?: string;
};

export function FeatureLock({
  access,
  featureLabel,
  mode = "overlay",
  upgradeHref = "/shop/billing",
  children,
  className,
}: Props) {
  const { t } = useT();

  const planLabel = (plan: string | null | undefined): string => {
    if (!plan) return t("plan.fallback");
    const key = `plan.${plan}`;
    const translated = t(key);
    return translated === key ? plan : translated;
  };

  // Loading or undefined: render children normally so we never block UI on a slow query
  if (!access) return <>{children}</>;

  const blockedByPlan = !access.allowed && (access.limit == null || access.used < (access.limit ?? Infinity));
  const blockedByLimit =
    !access.allowed && access.limit != null && access.used >= access.limit;

  if (access.allowed) {
    // Possibly show an 80% warning banner if applicable
    const pct = usagePercentage(access);
    if (access.limit != null && pct >= 80 && pct < 100) {
      return (
        <>
          <div className="mb-3 flex items-start gap-2 rounded-xl border border-peach/40 bg-peach/15 p-3 text-xs text-peach-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
            <div className="flex-1">
              <p className="font-medium">
                {t("featureLock.usageWarning", {
                  used: access.used,
                  limit: access.limit,
                  feature: featureLabel.toLowerCase(),
                })}
              </p>
              {access.upgradePlan && (
                <p className="mt-0.5 opacity-80">
                  {t("featureLock.usageUpgrade", { plan: planLabel(access.upgradePlan) })}
                </p>
              )}
            </div>
            {access.upgradePlan && (
              <Link to={upgradeHref} className="shrink-0">
                <Button variant="outline" size="sm">{t("featureLock.upgradeBtn")}</Button>
              </Link>
            )}
          </div>
          {children}
        </>
      );
    }
    return <>{children}</>;
  }

  const upgradeLabel = planLabel(access.upgradePlan);
  const upgradePriceRaw = planPriceLabel(access.upgradePlan);
  // planPriceLabel returns "€19/maand" — translate via shared key for locale parity.
  const upgradePrice = (() => {
    if (!access.upgradePlan) return "";
    const PRICE: Record<string, number> = { trial: 0, starter: 19, pro: 49, premium: 99 };
    const price = PRICE[access.upgradePlan];
    return price === undefined ? upgradePriceRaw : t("plan.priceMonthly", { price });
  })();

  const title = blockedByLimit
    ? t("featureLock.titleLimit", { feature: featureLabel })
    : upgradePrice
      ? t("featureLock.titlePlanWithPrice", { feature: featureLabel, plan: upgradeLabel, price: upgradePrice })
      : t("featureLock.titlePlan", { feature: featureLabel, plan: upgradeLabel });

  const description = blockedByLimit
    ? t("featureLock.descLimit", {
        used: access.used,
        limit: access.limit ?? 0,
        feature: featureLabel.toLowerCase(),
      })
    : blockedByPlan
      ? t("featureLock.descPlan", { plan: planLabel(access.currentPlan) })
      : "";

  if (mode === "inline" || !children) {
    return (
      <div
        className={cn(
          "flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-3 text-sm",
          className,
        )}
      >
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Lock className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">🔒 {title}</p>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {access.upgradePlan && (
          <Link to={upgradeHref} className="shrink-0">
            <Button variant="hero" size="sm">
              {t("featureLock.upgradeBtn")} <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        )}
      </div>
    );
  }

  // Overlay mode
  return (
    <div className={cn("relative", className)}>
      <div aria-hidden className="pointer-events-none select-none opacity-40 blur-[1px]">
        {children}
      </div>
      <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-background/60 p-4 backdrop-blur-sm">
        <div className="max-w-sm rounded-2xl border border-border bg-card p-5 text-center shadow-elevated">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Lock className="h-5 w-5" />
          </div>
          <p className="mt-3 text-sm font-semibold">🔒 {title}</p>
          {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
          {access.upgradePlan && (
            <Link to={upgradeHref}>
              <Button variant="hero" size="sm" className="mt-4">
                {t("featureLock.upgradeTo", { plan: upgradeLabel })} <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
