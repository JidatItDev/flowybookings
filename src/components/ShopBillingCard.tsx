// Shop-side platform billing card. Reuses the existing payments table — no new system.
// Shows current plan, expiry, payment history; provides checkout + mock-confirm buttons.

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { Loader2, Receipt, CalendarClock, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";
import { formatCents, relativeFromNow } from "@/lib/format";
import { PLATFORM_PROVIDER, type BillingCycle } from "@/lib/platform-billing";
import { planLabel } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { assertNotImpersonating, useImpersonationReadOnly } from "@/components/ImpersonationBanner";
import { usePlanPricing, formatPlanPrice } from "@/lib/use-plan-pricing";
import { usePendingBilling, markBillingPending } from "@/lib/use-pending-billing";

export function ShopBillingCard() {
  const { t } = useT();
  const { activeShop } = useAuth();
  const qc = useQueryClient();
  const readOnly = useImpersonationReadOnly();
  const readOnlyTitle = readOnly ? t("impersonate.readOnlyTooltip") : undefined;
  const search = useSearch({ strict: false }) as { billing?: string; payment?: string };

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
        .limit(20);
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
      const data = (await res.json()) as { ok?: boolean; checkout_url?: string; error?: string };
      if (!res.ok || !data.checkout_url) throw new Error(data.error ?? "checkout_failed");
      if (shopId) {
        markBillingPending({ shopId, plan, cycle: cycle === "yearly" ? "yearly" : "monthly" });
      }
      return data.checkout_url;
    },
    onSuccess: (url) => { window.location.href = url; },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmMock = useMutation({
    mutationFn: async ({ paymentId, outcome }: { paymentId: string; outcome: "paid" | "failed" }) => {
      assertNotImpersonating();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not signed in");
      const res = await fetch("/api/billing/plan-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ payment_id: paymentId, outcome }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "confirm_failed");
      }
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.outcome === "paid" ? "Subscription activated" : "Marked as failed");
      qc.invalidateQueries({ queryKey: ["shop", "billing-payments", shopId] });
      qc.invalidateQueries({ queryKey: ["auth", "shops"] });
    },
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

  const expiry = (activeShop as unknown as { plan_expires_at?: string | null })?.plan_expires_at ?? null;
  const cycle = (activeShop as unknown as { plan_billing_cycle?: string | null })?.plan_billing_cycle ?? null;
  const onboarding = (activeShop as unknown as { onboarding?: Record<string, unknown> })?.onboarding ?? {};
  const subscriptionStatus = (onboarding.subscription_status as string | undefined) ?? null;
  const expiresDate = expiry ? new Date(expiry) : null;
  const isExpired = !!expiresDate && expiresDate.getTime() < Date.now();
  const canCancel = activeShop?.plan && activeShop.plan !== "trial" && subscriptionStatus !== "cancelled";

  // "Next payment" line — only for actief betaald abonnement (geen trial,
  // niet opgezegd, niet vervallen). Hergebruikt de bestaande pricing-hook.
  const isPaidActive =
    !!activeShop?.plan &&
    activeShop.plan !== "trial" &&
    !isExpired &&
    subscriptionStatus !== "cancelled";
  const nextPaymentAmount = useMemo(() => {
    if (!isPaidActive) return null;
    const priceLabel = formatPlanPrice(pricing, activeShop?.plan, cycle === "yearly" ? "yearly" : "monthly");
    return priceLabel || null;
  }, [isPaidActive, pricing, activeShop?.plan, cycle]);

  const mockPaymentId = useMemo(() => {
    if (search?.billing !== "mock" || !search?.payment) return null;
    return search.payment;
  }, [search]);

  if (!activeShop) return null;

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Receipt className="h-4 w-4 text-primary" /> {t("shopBilling.title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("shopBilling.currentPlan")}: <span className="font-medium text-foreground">{pending && activeShop?.id === pending.shopId ? planLabel(pending.plan) : planLabel(activeShop!.plan)}</span>
            {cycle ? ` · ${t(`shopBilling.cycle.${cycle === "yearly" ? "yearly" : "monthly"}`)}` : ""}
            {pending && activeShop?.id === pending.shopId && activeShop?.plan !== pending.plan ? (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-semibold text-primary">
                <Loader2 className="h-3 w-3 animate-spin" /> {t("billing.activating")}
              </span>
            ) : null}
          </p>
        </div>
        <span className={cn(
          "rounded-full px-2.5 py-1 text-xs font-semibold",
          isExpired ? "bg-destructive/15 text-destructive"
            : expiresDate ? "bg-mint text-mint-foreground"
            : "bg-muted text-muted-foreground",
        )}>
          {expiresDate ? (
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5" />
              {(isExpired ? t("shopBilling.expiredOn") : t("shopBilling.renewsOn")) + " "}
              {expiresDate.toLocaleDateString()}
            </span>
          ) : t("shopBilling.noExpiry")}
        </span>
      </div>

      {/* Next-payment row + Mollie trust line — alleen tonen bij actief betaald
          abonnement met een bekende einddatum/bedrag. Geen duplicate billing-
          logic: alles komt uit `activeShop` en de bestaande pricing-hook. */}
      {isPaidActive && expiresDate && nextPaymentAmount && (
        <p className="mt-3 text-xs text-muted-foreground">
          {t("billing.nextPayment", {
            amount: nextPaymentAmount.replace(/\/(maand|jaar|month|year)$/, ""),
            date: expiresDate.toLocaleDateString(),
          })}
        </p>
      )}
      <p className="mt-1 text-xs text-muted-foreground">{t("billing.securePayments")}</p>

      {mockPaymentId && (
        <div className="mt-4 rounded-2xl border border-peach/60 bg-peach/30 p-3 text-xs text-foreground">
          <p className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" />{t("shopBilling.mockBanner")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => confirmMock.mutate({ paymentId: mockPaymentId, outcome: "paid" })} disabled={confirmMock.isPending || readOnly} title={readOnlyTitle}>
              {confirmMock.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {t("shopBilling.mockPay")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => confirmMock.mutate({ paymentId: mockPaymentId, outcome: "failed" })} disabled={confirmMock.isPending || readOnly} title={readOnlyTitle}>
              {t("shopBilling.mockFail")}
            </Button>
          </div>
        </div>
      )}

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
      const data = (await res.json()) as { ok?: boolean; checkout_url?: string; error?: string };
      if (!res.ok || !data.checkout_url) throw new Error(data.error ?? "checkout_failed");
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
