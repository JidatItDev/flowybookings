import { Link } from "@tanstack/react-router";
import { AlertTriangle, Clock, ArrowRight, CreditCard, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/lib/auth-context";
import { getTrialState } from "@/shared/lib/trial";
import { useT } from "@/shared/lib/i18n";

/**
 * Site-wide trial / subscription banner shown above the shop dashboard.
 * Priority order:
 *   1. payment_failed grace expired → red "boekingen geblokkeerd" banner
 *   2. payment_failed in grace      → orange "betaling mislukt, X dagen" banner
 *   3. trial expired                → red blocking banner
 *   4. trial ≤7 days                → countdown banner
 *   5. cancelled but still active   → neutral info banner with end date
 *   6. else                         → niets
 */
export function TrialBanner() {
  const { activeShop } = useAuth();
  const { t } = useT();
  const state = getTrialState(activeShop as never);

  // 1) Payment failed + grace verlopen
  if (state.paymentFailedGraceExpired) {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-destructive shadow-soft">
        <Ban className="h-5 w-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t("billing.paymentFailedBlockedTitle")}</p>
          <p className="text-xs opacity-90">{t("billing.paymentFailedBlockedSub")}</p>
        </div>
        <Link to="/shop/settings">
          <Button variant="destructive" size="sm">
            {t("billing.updatePayment")} <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    );
  }

  // 2) Payment failed binnen grace-window
  if (state.subscriptionStatus === "payment_failed" && state.inPaymentFailedGrace && state.paymentFailedDaysLeft != null) {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-pink/50 bg-gradient-warm/40 p-4 shadow-soft">
        <CreditCard className="h-5 w-5 shrink-0 text-pink-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t("billing.paymentFailedTitle")}</p>
          <p className="text-xs text-muted-foreground">
            {t("billing.paymentFailedSub", { days: state.paymentFailedDaysLeft })}
          </p>
        </div>
        <Link to="/shop/settings">
          <Button variant="hero" size="sm">
            {t("billing.updatePayment")} <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    );
  }

  // 3) Trial verlopen
  if (state.isTrial && state.isExpired) {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-destructive shadow-soft">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t("billing.trialExpiredTitle")}</p>
          <p className="text-xs opacity-90">{t("billing.trialExpiredSub")}</p>
        </div>
        <Link to="/shop/upgrade">
          <Button variant="destructive" size="sm">
            {t("billing.choosePlan")} <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    );
  }

  // 5) Cancelled maar nog actief tot expiry
  if (state.subscriptionStatus === "cancelled" && state.expiresAt && state.expiresAt.getTime() > Date.now()) {
    const planName = (activeShop?.plan ?? "trial").toString();
    const planLabel = planName.charAt(0).toUpperCase() + planName.slice(1);
    return (
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-muted/40 p-4 shadow-soft">
        <Clock className="h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {t("billing.planActiveUntilTitle", {
              plan: planLabel,
              date: state.expiresAt.toLocaleDateString("nl-NL"),
            })}
          </p>
          <p className="text-xs text-muted-foreground">{t("billing.planActiveUntilSub")}</p>
        </div>
        <Link to="/shop/upgrade">
          <Button variant="outline" size="sm">{t("billing.reactivate")}</Button>
        </Link>
      </div>
    );
  }

  // 4) Trial countdown — split into "ending" (≤3 dagen, urgent) en
  //    "active" (>3 dagen). Beide tonen de exacte einddatum zodat er
  //    nooit verwarring is over wanneer er kosten in rekening komen.
  if (state.isTrial && state.daysLeft !== null && state.daysLeft > 0 && state.expiresAt) {
    const dateLabel = state.expiresAt.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
    const ending = state.daysLeft <= 3;

    if (ending) {
      return (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-pink/50 bg-gradient-warm/40 p-4 shadow-soft">
          <Clock className="h-5 w-5 shrink-0 text-pink-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              {t("billing.trialEndingTitle", { days: state.daysLeft })}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("billing.trialEndingSub", { days: state.daysLeft, date: dateLabel })}
            </p>
          </div>
          <Link to="/shop/upgrade">
            <Button variant="hero" size="sm">
              {t("billing.choosePlan")} <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      );
    }

    return (
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-primary/30 bg-primary-soft/40 p-4 shadow-soft">
        <Clock className="h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t("billing.trialActiveTitle")}</p>
          <p className="text-xs text-muted-foreground">
            {t("billing.trialActiveSub", { date: dateLabel })}
          </p>
        </div>
        <Link to="/shop/upgrade">
          <Button variant="outline" size="sm">
            {t("billing.viewPlans")} <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    );
  }

  return null;
}
