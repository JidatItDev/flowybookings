import { Link } from "@tanstack/react-router";
import { AlertTriangle, Clock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { getTrialState } from "@/lib/trial";

/**
 * Site-wide trial banner shown above the shop dashboard.
 * - Days 1..3: green/neutral countdown (only when ≤7 days left)
 * - Days 4..7: warning-style countdown
 * - Day 14+ / expired: red blocking banner
 */
export function TrialBanner() {
  const { activeShop } = useAuth();
  const state = getTrialState(activeShop as never);

  if (!state.isTrial) return null;

  if (state.isExpired) {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-destructive shadow-soft">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Je gratis proefperiode is verlopen</p>
          <p className="text-xs opacity-90">
            Je kunt geen nieuwe afspraken meer aanmaken. Bestaande gegevens blijven zichtbaar. Kies een plan om door te gaan.
          </p>
        </div>
        <Link to="/shop/upgrade">
          <Button variant="destructive" size="sm">
            Kies een plan <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    );
  }

  if (state.daysLeft === null || state.daysLeft > 7) return null;

  const urgent = state.daysLeft <= 3;
  return (
    <div
      className={
        "mb-4 flex flex-wrap items-center gap-3 rounded-2xl border p-4 shadow-soft " +
        (urgent
          ? "border-pink/50 bg-gradient-warm/40"
          : "border-primary/30 bg-primary-soft/40")
      }
    >
      <Clock className={"h-5 w-5 shrink-0 " + (urgent ? "text-pink-foreground" : "text-primary")} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          Nog {state.daysLeft} {state.daysLeft === 1 ? "dag" : "dagen"} in je gratis proefperiode
        </p>
        <p className="text-xs text-muted-foreground">
          Kies een plan voordat je trial verloopt om afspraken te kunnen blijven aannemen.
        </p>
      </div>
      <Link to="/shop/upgrade">
        <Button variant={urgent ? "hero" : "outline"} size="sm">
          Bekijk plannen <ArrowRight className="h-4 w-4" />
        </Button>
      </Link>
    </div>
  );
}
