// Shop-side platform billing card. Reuses the existing payments table — no new system.

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Receipt, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/lib/auth-context";
import { useT } from "@/shared/lib/i18n";
import { formatCents, relativeFromNow } from "@/shared/lib/format";
import { PLATFORM_PROVIDER, type BillingCycle } from "@/admin/settings/platform-billing";
import { planLabel } from "@/shared/lib/plans";
import { cn } from "@/shared/lib/utils";
import { assertNotImpersonating, useImpersonationReadOnly } from "@/admin/impersonation/ImpersonationBanner";
import { usePlanPricing, formatPlanPrice } from "@/shop/billing/use-plan-pricing";
import { usePendingBilling, markBillingPending } from "@/shop/billing/use-pending-billing";
import { useLastPaidPlan } from "@/shop/billing/use-last-paid-plan";

export function ShopBillingCard() {
  const { t } = useT();
  const { activeShop } = useAuth();
  const qc = useQueryClient();
  const readOnly = useImpersonationReadOnly();
  const readOnlyTitle = readOnly ? t("impersonate.readOnlyTooltip") : undefined;

  const shopId = activeShop?.id ?? null;
  const { data: pricing } = usePlanPricing();
  const pending = usePendingBilling();
  const { data: payments, isLoading } = useQuery({
    queryKey: ["shop", "billing-payments", shopId],
    enabled: !!shopId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, amount_cents, currency, status, created_at, metadata")
        .eq("shop_id", shopId!)
        .eq("provider", PLATFORM_PROVIDER)
        .is("booking_id", null)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });

  const checkout = useMutation({
    mutationFn: async ({ plan, cycle }: { plan: "starter" | "pro" | "premium"; cycle: BillingCycle }) => {
      assertNotImpersonating();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not signed in");
      const res = await fetch("/api/billing/plan-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ shop_id: shopId, plan, cycle, redirect_origin: window.location.origin }),
      });
      const data = (await res.json()) as { ok?: boolean; checkout_url?: string; error?: string; details?: string };
      if (!res.ok || !data.checkout_url) throw new Error(data.details ?? data.error ?? "checkout_failed");
      if (shopId) {
        markBillingPending({ shopId, plan, cycle: cycle === "yearly" ? "yearly" : "monthly" });
      }
      return data.checkout_url;
    },
    onSuccess: (url) => { window.location.href = url; },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelSubscription = useMutation({
    mutationFn: async () => {
      assertNotImpersonating();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not signed in");
      const res = await fetch("/api/billing/plan-cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ shop_id: shopId }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "cancel_failed");
      }
    },
    onSuccess: () => {
      toast.success(t("billing.cancelSuccess"));
      qc.invalidateQueries({ queryKey: ["auth", "shops"] });
      qc.invalidateQueries({ queryKey: ["shop", "billing-payments", shopId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const expiry = activeShop?.plan_expires_at ?? null;
  const cycle = activeShop?.plan_billing_cycle ?? null;
  const subscriptionStatus = activeShop?.subscription_status ?? null;
  // Fully lapsed (cancelled/unpaid plan whose access window ended). shops.plan is
  // "starter" here regardless of the real prior tier — billing-expiry.ts always
  // resets it — so the actual last plan comes from the last paid payment instead.
  const isLapsed = subscriptionStatus === "none" && activeShop?.plan !== "trial";
  const { data: lastPaidPlan } = useLastPaidPlan(isLapsed ? shopId : null);
  const displayPlan = isLapsed && lastPaidPlan ? lastPaidPlan : activeShop?.plan;
  const nextBillingRaw = activeShop?.next_billing_at ?? null;
  const expiresDate = expiry ? new Date(expiry) : null;
  const nextBillingDate = nextBillingRaw ? new Date(nextBillingRaw) : null;
  const isExpired = !!expiresDate && expiresDate.getTime() < Date.now();
  // "none" means no live Mollie subscription exists to cancel (e.g. lapsed past
  // expiry) — showing Cancel there would just mislabel the shop as "cancelled"
  // rather than "never subscribed" for no functional reason.
  const canCancel =
    activeShop?.plan &&
    activeShop.plan !== "trial" &&
    subscriptionStatus !== "cancelled" &&
    subscriptionStatus !== "none";
  const scheduledPlan = activeShop?.pending_plan ?? null;
  const scheduledAt = activeShop?.pending_plan_effective_at ?? null;

  const pendingCharge = useMemo(() => {
    const rows = payments ?? [];
    return rows.find((p) => {
      if (p.status !== "unpaid") return false;
      const kind = (p.metadata as { kind?: string } | null)?.kind;
      return kind === "subscription_recurring";
    }) ?? null;
  }, [payments]);

  const pendingCollectionDate = useMemo(() => {
    if (!pendingCharge) return null;
    const meta = (pendingCharge.metadata ?? {}) as { collection_at?: string };
    if (meta.collection_at) {
      const d = new Date(meta.collection_at);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    return nextBillingDate;
  }, [pendingCharge, nextBillingDate]);

  // Charge date Mollie will try (preferred) — never invent from a fake renew repair.
  const chargeDate = pendingCollectionDate ?? nextBillingDate;
  const isPaidActive =
    !!activeShop?.plan &&
    activeShop.plan !== "trial" &&
    subscriptionStatus === "active" &&
    (!!chargeDate || (!!expiresDate && !isExpired));
  const statusBadge =
    subscriptionStatus === "cancelled"
      ? `Cancelled — access until ${expiresDate ? expiresDate.toLocaleDateString() : "—"}`
      : subscriptionStatus === "payment_failed"
        ? "Payment failed"
        : pendingCharge
          ? "Payment pending"
          : isPaidActive
            ? "Active"
            : null;

  const nextPaymentAmount = useMemo(() => {
    if (!isPaidActive && !pendingCharge) return null;
    // When a downgrade is scheduled, Mollie already charges the pending plan amount.
    const billPlan = scheduledPlan && ["starter", "pro", "premium"].includes(scheduledPlan)
      ? scheduledPlan
      : activeShop?.plan;
    const priceLabel = formatPlanPrice(pricing, billPlan, cycle === "yearly" ? "yearly" : "monthly");
    return priceLabel || null;
  }, [isPaidActive, pendingCharge, pricing, activeShop?.plan, cycle, scheduledPlan]);

  if (!activeShop) return null;

  const datePill = (() => {
    if (isLapsed) {
      return {
        className: "bg-destructive/15 text-destructive",
        label: t("shopBilling.lapsedNoSubscription"),
      };
    }
    if (pendingCharge && chargeDate) {
      return {
        className: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
        label: t("shopBilling.chargesOn") + " " + chargeDate.toLocaleDateString(),
      };
    }
    if (subscriptionStatus === "cancelled" && expiresDate) {
      return {
        className: isExpired ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground",
        label: (isExpired ? t("shopBilling.expiredOn") : t("shopBilling.accessUntil")) + " " + expiresDate.toLocaleDateString(),
      };
    }
    if (chargeDate) {
      return {
        className: "bg-mint text-mint-foreground",
        label: t("shopBilling.chargesOn") + " " + chargeDate.toLocaleDateString(),
      };
    }
    if (expiresDate) {
      return {
        className: isExpired ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground",
        label: (isExpired ? t("shopBilling.expiredOn") : t("shopBilling.accessUntil")) + " " + expiresDate.toLocaleDateString(),
      };
    }
    return {
      className: "bg-muted text-muted-foreground",
      label: t("shopBilling.noExpiry"),
    };
  })();

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Receipt className="h-4 w-4 text-primary" /> {t("shopBilling.title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {isLapsed ? t("shopBilling.previousPlan") : t("shopBilling.currentPlan")}: <span className="font-medium text-foreground">{pending && activeShop?.id === pending.shopId ? planLabel(pending.plan) : planLabel(displayPlan)}</span>
            {!isLapsed && cycle ? ` · ${t(`shopBilling.cycle.${cycle === "yearly" ? "yearly" : "monthly"}`)}` : ""}
            {statusBadge ? (
              <span className="ml-2 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {statusBadge}
              </span>
            ) : null}
            {scheduledPlan && scheduledAt ? (
              <span className="ml-2 text-xs text-muted-foreground">
                Scheduled: {planLabel(scheduledPlan)} on {new Date(scheduledAt).toLocaleDateString()}
              </span>
            ) : null}
            {pending && activeShop?.id === pending.shopId && activeShop?.plan !== pending.plan ? (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-semibold text-primary">
                <Loader2 className="h-3 w-3 animate-spin" /> {t("billing.activating")}
              </span>
            ) : null}
          </p>
        </div>
        <span className={cn(
          "rounded-full px-2.5 py-1 text-xs font-semibold",
          datePill.className,
        )}>
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="h-3.5 w-3.5" />
            {datePill.label}
          </span>
        </span>
      </div>

      {/* Next-payment row tracks Mollie's charge attempt, not a local invent date. */}
      {(isPaidActive || pendingCharge) && chargeDate && nextPaymentAmount && (
        <p className="mt-3 text-xs text-muted-foreground">
          {pendingCharge
            ? t("billing.pendingPayment", {
                amount: nextPaymentAmount.replace(/\/(maand|jaar|month|year)$/, ""),
                date: chargeDate.toLocaleDateString(),
              })
            : t("billing.nextPayment", {
                amount: nextPaymentAmount.replace(/\/(maand|jaar|month|year)$/, ""),
                date: chargeDate.toLocaleDateString(),
              })}
        </p>
      )}
      <p className="mt-1 text-xs text-muted-foreground">{t("billing.securePayments")}</p>

      {canCancel && (
        <div className="mt-4 flex justify-end">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (window.confirm(t("billing.cancelConfirm"))) {
                cancelSubscription.mutate();
              }
            }}
            disabled={cancelSubscription.isPending || readOnly}
            title={readOnlyTitle}
            className="text-muted-foreground hover:text-destructive"
          >
            {cancelSubscription.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("billing.cancel")}
          </Button>
        </div>
      )}

      <div className="mt-5">
        <h3 className="text-sm font-semibold">{t("shopBilling.history")}</h3>
        {isLoading ? (
          <div className="mt-2 space-y-2">
            {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
          </div>
        ) : (payments ?? []).length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">{t("shopBilling.noHistory")}</p>
        ) : (
          <ul className="mt-2 divide-y divide-border rounded-2xl border border-border">
            {(payments ?? []).map((p) => {
              const meta = (p.metadata ?? {}) as { plan?: string; cycle?: string };
              return (
                <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium capitalize">
                      {meta.plan ?? "—"} · {meta.cycle ?? "monthly"}
                    </p>
                    <p className="text-xs text-muted-foreground">{relativeFromNow(p.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2 text-right">
                    <span className="text-xs font-medium capitalize text-muted-foreground">{p.status}</span>
                    <span className="text-sm font-semibold">{formatCents(p.amount_cents, p.currency)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Re-export the checkout helper for the parent page */}
      <input type="hidden" data-checkout-pending={checkout.isPending ? "1" : "0"} />
    </div>
  );
}

/** Standalone hook so the upgrade buttons on the parent page can trigger real checkout. */
export function usePlanCheckout() {
  const { activeShop } = useAuth();
  return useMutation({
    mutationFn: async ({ plan, cycle = "monthly" as BillingCycle }: { plan: "starter" | "pro" | "premium"; cycle?: BillingCycle }) => {
      assertNotImpersonating();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not signed in");
      if (!activeShop) throw new Error("No active shop");
      const res = await fetch("/api/billing/plan-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ shop_id: activeShop.id, plan, cycle, redirect_origin: window.location.origin }),
      });
      const data = (await res.json()) as { ok?: boolean; checkout_url?: string; error?: string; details?: string };
      if (!res.ok || !data.checkout_url) throw new Error(data.details ?? data.error ?? "checkout_failed");
      // Optimistic UI: mark this shop as pending the requested plan so the
      // header + cards can show "Activatie loopt…" instead of stale TRIAL
      // while the user comes back from Mollie and the webhook fires.
      markBillingPending({
        shopId: activeShop.id,
        plan,
        cycle: cycle === "yearly" ? "yearly" : "monthly",
      });
      window.location.href = data.checkout_url;
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
