import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, Sparkles, Lock, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Variant = "no-shows" | "staff-limit" | "premium-locked";

interface Props {
  variant: Variant;
  /** Number used in the message body (e.g. no-show count or staff limit). */
  count?: number;
  /** Plan being promoted. */
  plan?: "Pro" | "Premium";
  /** Feature name (used by premium-locked variant). */
  feature?: string;
  /** Allow user to hide for the session. */
  dismissible?: boolean;
  className?: string;
}

const styles: Record<Variant, { ring: string; bg: string; icon: typeof Sparkles; iconBg: string }> = {
  "no-shows": { ring: "border-pink/40", bg: "bg-gradient-warm/30", icon: AlertTriangle, iconBg: "bg-pink text-pink-foreground" },
  "staff-limit": { ring: "border-primary/30", bg: "bg-primary-soft/40", icon: Sparkles, iconBg: "bg-gradient-brand text-primary-foreground" },
  "premium-locked": { ring: "border-primary/30", bg: "bg-primary-soft/30", icon: Lock, iconBg: "bg-gradient-brand text-primary-foreground" },
};

export function UpgradeNudge({ variant, count = 0, plan = "Pro", feature = "", dismissible = true, className }: Props) {
  const { t } = useT();
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;

  const s = styles[variant];
  const Icon = s.icon;

  const title =
    variant === "no-shows" ? t("nudge.noShowsTitle") :
    variant === "staff-limit" ? t("nudge.staffLimitTitle") :
    t("nudge.premiumLockedTitle", { plan });

  const body =
    variant === "no-shows" ? t("nudge.noShowsBody", { count: String(count) }) :
    variant === "staff-limit" ? t("nudge.staffLimitBody", { limit: String(count) }) :
    t("nudge.premiumLockedBody", { plan, feature });

  const cta =
    variant === "no-shows" ? t("nudge.noShowsCta") :
    variant === "staff-limit" ? t("nudge.staffLimitCta") :
    t("nudge.premiumLockedCta", { plan });

  return (
    <div className={cn("relative flex items-start gap-4 rounded-2xl border p-5 shadow-soft", s.ring, s.bg, className)}>
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", s.iconBg)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{body}</p>
        <div className="mt-3">
          <Link to="/shop/upgrade">
            <Button variant="hero" size="sm">
              {cta} <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>
      {dismissible && (
        <button
          onClick={() => setHidden(true)}
          aria-label={t("nudge.dismiss")}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function PremiumBadge({ plan = "Pro" }: { plan?: "Pro" | "Premium" }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gradient-brand px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
      <Sparkles className="h-3 w-3" /> {plan}
    </span>
  );
}
