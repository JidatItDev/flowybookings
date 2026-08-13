import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Sparkles,
  UserCog,
  Link2,
  X,
  ChevronRight,
  Copy,
  Clock,
  CreditCard,
  PartyPopper,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useT } from "@/shared/lib/i18n";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { shopFullQuery, shopKeys } from "@/shop/shared/queries-barrel";
import { getBookingUrl } from "@/shared/lib/booking-url";

type Props = {
  shopId: string;
  hasService: boolean;
  hasStaff: boolean;
  hasHours: boolean;
  hasPayments: boolean;
  shopSlug?: string | null;
};

type OnboardingState = {
  shared?: boolean;
  dismissed?: boolean;
  paymentsSkipped?: boolean;
  shareSkipped?: boolean;
  celebrated?: boolean;
};

export function OnboardingChecklist({
  shopId,
  hasService,
  hasStaff,
  hasHours,
  hasPayments,
  shopSlug,
}: Props) {
  const { t } = useT();
  const qc = useQueryClient();

  const { data: shop } = useQuery({ ...shopFullQuery(shopId), enabled: !!shopId });
  const onboarding = ((shop?.onboarding ?? {}) as OnboardingState) || {};
  const shared = !!onboarding.shared;
  const dismissed = !!onboarding.dismissed;
  const paymentsSkipped = !!onboarding.paymentsSkipped;
  const shareSkipped = !!onboarding.shareSkipped;

  const bookingUrl = useMemo(
    () => (shopSlug ? getBookingUrl(shopSlug, { external: true }) : ""),
    [shopSlug],
  );

  const updateOnboarding = useMutation({
    mutationFn: async (patch: OnboardingState) => {
      const next = { ...((shop?.onboarding as OnboardingState) ?? {}), ...patch };
      const { error } = await supabase.from("shops").update({ onboarding: next }).eq("id", shopId);
      if (error) throw error;
      return next;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: shopKeys.shopFull(shopId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Required steps drive the "ready to receive bookings" success state.
  // Payments + share are optional — they don't block success but improve activation.
  const requiredItems = [
    {
      key: "service",
      done: hasService,
      required: true,
      title: t("checklist.serviceTitle"),
      desc: t("checklist.serviceDesc"),
      cta: t("checklist.serviceCta"),
      to: "/shop/services" as const,
      icon: Sparkles,
    },
    {
      key: "staff",
      done: hasStaff,
      required: true,
      title: t("checklist.staffTitle"),
      desc: t("checklist.staffDesc"),
      cta: t("checklist.staffCta"),
      to: "/shop/staff" as const,
      icon: UserCog,
    },
    {
      key: "hours",
      done: hasHours,
      required: true,
      title: t("checklist.hoursTitle"),
      desc: t("checklist.hoursDesc"),
      cta: t("checklist.hoursCta"),
      to: "/shop/settings" as const,
      icon: Clock,
    },
  ];

  const optionalItems = [
    {
      key: "payments",
      done: hasPayments || paymentsSkipped,
      skipped: paymentsSkipped && !hasPayments,
      required: false,
      title: t("checklist.paymentsTitle"),
      desc: t("checklist.paymentsDesc"),
      cta: t("checklist.paymentsCta"),
      to: "/shop/payments" as const,
      icon: CreditCard,
    },
    {
      key: "share",
      done: shared || shareSkipped,
      skipped: shareSkipped && !shared,
      required: false,
      title: t("checklist.shareTitle"),
      desc: t("checklist.shareDesc"),
      cta: t("checklist.shareCta"),
      to: null,
      icon: Link2,
    },
  ];

  const allItems = [...requiredItems, ...optionalItems];
  const completed = allItems.filter((i) => i.done).length;
  const requiredDone = requiredItems.every((i) => i.done);
  const allDone = allItems.every((i) => i.done);

  if (dismissed) return null;

  const handleCopy = async () => {
    if (!bookingUrl) return;
    try {
      await navigator.clipboard.writeText(bookingUrl);
      updateOnboarding.mutate({ shared: true });
      toast.success(t("checklist.linkCopied"));
    } catch {
      toast.error(t("checklist.copyFailed"));
    }
  };

  const handleSkipPayments = () => updateOnboarding.mutate({ paymentsSkipped: true });
  const handleSkipShare = () => updateOnboarding.mutate({ shareSkipped: true });
  const handleDismiss = () => updateOnboarding.mutate({ dismissed: true });

  const pct = Math.round((completed / allItems.length) * 100);

  // ── Success state: required setup is complete ──────────────────────────────
  if (requiredDone) {
    return (
      <div className="mb-6 overflow-hidden rounded-2xl border border-mint/40 bg-gradient-to-br from-card via-card to-mint/10 shadow-soft">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-5 sm:p-6">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-brand text-primary-foreground shadow-soft">
            <PartyPopper className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-mint/20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-mint-foreground">
                {t("checklist.successBadge")}
              </span>
            </div>
            <h2 className="mt-1.5 text-base font-semibold sm:text-lg">
              {t("checklist.successTitle")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("checklist.successDesc")}
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
            <Link to="/shop/calendar" className="w-full sm:w-auto">
              <Button variant="hero" size="lg" className="w-full">
                <Plus className="h-4 w-4" /> {t("checklist.successCta")}
              </Button>
            </Link>
            <button
              type="button"
              onClick={handleDismiss}
              className="text-xs font-medium text-muted-foreground hover:text-foreground sm:px-2"
            >
              {t("checklist.dismiss")}
            </button>
          </div>
        </div>

        {/* Optional activation helpers — only show if user hasn't done them */}
        {!allDone && (
          <div className="border-t border-border/60 bg-background/40 px-5 py-3 sm:px-6">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("checklist.optionalLabel")}
            </p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {optionalItems
                .filter((i) => !i.done)
                .map((item) => {
                  const Icon = item.icon;
                  return (
                    <li
                      key={item.key}
                      className="flex items-center gap-3 rounded-xl border border-border/60 bg-card px-3 py-2"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.title}</p>
                      </div>
                      {item.key === "share" ? (
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="outline" onClick={handleCopy} disabled={!bookingUrl}>
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <button
                            type="button"
                            onClick={handleSkipShare}
                            className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
                          >
                            {t("checklist.skip")}
                          </button>
                        </div>
                      ) : item.to ? (
                        <div className="flex items-center gap-1">
                          <Link to={item.to}>
                            <Button size="sm" variant="outline">
                              <ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                          <button
                            type="button"
                            onClick={handleSkipPayments}
                            className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
                          >
                            {t("checklist.skip")}
                          </button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
            </ul>
          </div>
        )}
      </div>
    );
  }

  // ── Default state: still finishing required setup ──────────────────────────
  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card to-primary/5 shadow-soft">
      <div className="flex items-start justify-between gap-3 border-b border-border/60 px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
              {t("checklist.badge")}
            </span>
            <h2 className="truncate text-base font-semibold">{t("checklist.title")}</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("checklist.progress", {
              done: String(completed),
              total: String(allItems.length),
            })}
          </p>
          <div className="mt-3 max-w-xs">
            <Progress value={pct} className="h-1.5" />
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={t("checklist.dismiss")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <ul className="divide-y divide-border/60">
        {allItems.map((item) => {
          const Icon = item.icon;
          const isOptional = !item.required;
          return (
            <li key={item.key} className="flex items-center gap-3 px-5 py-3 sm:px-6">
              <span
                className={
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border " +
                  (item.done
                    ? "border-mint bg-mint text-mint-foreground"
                    : "border-border bg-background text-muted-foreground")
                }
              >
                {item.done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p
                    className={
                      "truncate text-sm font-medium " +
                      (item.done ? "text-muted-foreground line-through" : "")
                    }
                  >
                    {item.title}
                  </p>
                  {isOptional && !item.done && (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {t("checklist.optional")}
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">{item.desc}</p>
              </div>
              {!item.done &&
                (item.key === "share" ? (
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="outline" onClick={handleCopy} disabled={!bookingUrl}>
                      <Copy className="h-3.5 w-3.5" /> {item.cta}
                    </Button>
                    {isOptional && (
                      <button
                        type="button"
                        onClick={handleSkipShare}
                        className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
                      >
                        {t("checklist.skip")}
                      </button>
                    )}
                  </div>
                ) : item.to ? (
                  <div className="flex items-center gap-1.5">
                    <Link to={item.to}>
                      <Button size="sm" variant="outline">
                        {item.cta} <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                    {isOptional && item.key === "payments" && (
                      <button
                        type="button"
                        onClick={handleSkipPayments}
                        className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
                      >
                        {t("checklist.skip")}
                      </button>
                    )}
                  </div>
                ) : null)}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
