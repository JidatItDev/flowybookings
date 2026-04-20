// Soft-lock overlay used to gate features that require a higher plan.
// Renders the children visually disabled, with a centered upgrade CTA on top.
// When `mode="inline"` it renders a compact horizontal lock notice instead of an overlay.

import { Link } from "@tanstack/react-router";
import { Lock, ArrowRight, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  type FeatureAccess,
  planLabelFor,
  planPriceLabel,
  usagePercentage,
} from "@/lib/use-feature-access";

type Props = {
  access: FeatureAccess | undefined;
  /** Human label for the locked feature, e.g. "SMS herinneringen". */
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
  upgradeHref = "/shop/upgrade",
  children,
  className,
}: Props) {
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
                Je hebt {access.used}/{access.limit} {featureLabel.toLowerCase()} gebruikt deze maand.
              </p>
              {access.upgradePlan && (
                <p className="mt-0.5 opacity-80">
                  Upgrade naar {planLabelFor(access.upgradePlan)} voor een hoger limiet.
                </p>
              )}
            </div>
            {access.upgradePlan && (
              <Link to={upgradeHref} className="shrink-0">
                <Button variant="outline" size="sm">Upgrade</Button>
              </Link>
            )}
          </div>
          {children}
        </>
      );
    }
    return <>{children}</>;
  }

  const upgradeLabel = access.upgradePlan ? planLabelFor(access.upgradePlan) : "een hoger plan";
  const upgradePrice = planPriceLabel(access.upgradePlan);
  const title = blockedByLimit
    ? `Je ${featureLabel}-limiet is bereikt`
    : `${featureLabel} — beschikbaar vanaf ${upgradeLabel}${upgradePrice ? ` (${upgradePrice})` : ""}`;
  const description = blockedByLimit
    ? `Je hebt ${access.used}/${access.limit} ${featureLabel.toLowerCase()} gebruikt deze maand. Upgrade voor meer of wacht tot volgende maand.`
    : blockedByPlan
      ? `Deze functie zit niet in je huidige plan (${planLabelFor(access.currentPlan)}). Upgrade om hem te activeren.`
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
              Upgrade <ArrowRight className="h-3.5 w-3.5" />
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
                Upgrade naar {upgradeLabel} <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
