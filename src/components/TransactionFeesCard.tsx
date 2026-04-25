// Shop-side transparency card for the per-booking transaction fee.
//
// Reuses existing systems — does NOT duplicate any logic:
//   - Plan source of truth: activeShop.plan via useAuth()
//   - Per-plan fee helper: bookingFeeCentsForPlan() from @/lib/mollie-connect
//     (single source of truth — same helper the booking checkout uses)
//   - Fee records: existing public.payments.application_fee_cents
//     (only filled on Mollie Connect bookings — already excludes failed/refunded
//     because we filter on status === "paid")
//
// We intentionally do NOT write any new fees here — fees are created by
// /api/bookings/checkout when the Mollie payment row is inserted, and only
// "stick" once the webhook flips the status to "paid". So summing
// application_fee_cents for status="paid" rows is automatically:
//   - one fee per successful payment (idempotent via payments.id PK)
//   - excludes failed / cancelled / refunded
//   - plan-aware (the value stored at creation time reflects the plan THEN)

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Receipt, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";
import { formatCents, formatDate } from "@/lib/format";
import { bookingFeeCentsForPlan } from "@/lib/plan-fees";
import { planLabel } from "@/lib/plans";
import { cn } from "@/lib/utils";

export function TransactionFeesCard() {
  const { t } = useT();
  const { activeShop } = useAuth();
  const shopId = activeShop?.id ?? null;
  const plan = (activeShop?.plan ?? "trial") as string;

  // Resolved per-booking fee for the current plan (cents). Single source of
  // truth — same helper used server-side in /api/bookings/checkout.
  const feePerBookingCents = bookingFeeCentsForPlan(plan);

  // Month window for "this month" totals.
  const monthStart = useMemo(() => {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
  }, []);

  // Paid Mollie Connect booking payments — fees only count when status === paid.
  const { data: paidThisMonth = [] } = useQuery({
    queryKey: ["shop", "fees", "paid-month", shopId, monthStart],
    enabled: !!shopId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, application_fee_cents, amount_cents, currency, created_at, booking_id")
        .eq("shop_id", shopId!)
        .eq("status", "paid")
        .not("booking_id", "is", null)
        .gte("created_at", monthStart)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Last 10 fee items overall (any month) — recent transparency log.
  const { data: lastFees = [], isLoading } = useQuery({
    queryKey: ["shop", "fees", "recent", shopId],
    enabled: !!shopId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, application_fee_cents, amount_cents, currency, created_at, booking_id")
        .eq("shop_id", shopId!)
        .eq("status", "paid")
        .not("booking_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  const paidCount = paidThisMonth.length;
  const feesThisMonthCents = paidThisMonth.reduce(
    (s, p) => s + (p.application_fee_cents ?? 0),
    0,
  );

  // Plan-specific reassurance copy
  const explainerKey =
    plan === "premium"
      ? "fees.explainer.premium"
      : plan === "pro"
        ? "fees.explainer.pro"
        : plan === "starter"
          ? "fees.explainer.starter"
          : "fees.explainer.trial";

  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
      <header className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-mint text-mint-foreground">
          <Receipt className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold sm:text-lg">{t("fees.title")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
            {t("fees.subtitle")}
          </p>
        </div>
      </header>

      {/* Stats grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={t("fees.statPlan")}
          value={planLabel(plan as never)}
          tone="primary"
        />
        <Stat
          label={t("fees.statPerBooking")}
          value={feePerBookingCents > 0 ? formatCents(feePerBookingCents) : t("pricing.noFee")}
          tone="mint"
        />
        <Stat
          label={t("fees.statPaidThisMonth")}
          value={String(paidCount)}
          tone="peach"
        />
        <Stat
          label={t("fees.statTotalThisMonth")}
          value={formatCents(feesThisMonthCents)}
          tone="primary"
          highlight
        />
      </div>

      {/* Plan-aware explainer */}
      <p className="mt-4 rounded-2xl bg-muted/50 px-4 py-3 text-xs leading-relaxed text-muted-foreground sm:text-sm">
        {t(explainerKey)}
      </p>

      {/* Trust strip */}
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <TrustItem icon={ShieldCheck} label={t("fees.trust.noHidden")} />
        <TrustItem icon={Sparkles} label={t("fees.trust.onlyPaid")} />
        <TrustItem icon={TrendingUp} label={t("fees.trust.alwaysClear")} />
      </div>

      {/* Recent fees log */}
      <div className="mt-5">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("fees.recentTitle")}
        </h3>
        {isLoading ? (
          <div className="h-24 animate-pulse rounded-2xl bg-muted/40" />
        ) : lastFees.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
            {t("fees.recentEmpty")}
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border">
            {lastFees.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {formatCents(p.amount_cents, p.currency)}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      {t("fees.itemBooking")}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(p.created_at)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-foreground">
                    {p.application_fee_cents > 0
                      ? `−${formatCents(p.application_fee_cents, p.currency)}`
                      : formatCents(0, p.currency)}
                  </p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {t("fees.itemFee")}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
  highlight = false,
}: {
  label: string;
  value: string;
  tone: "primary" | "mint" | "peach";
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border p-3",
        highlight ? "bg-primary-soft" : "bg-muted/30",
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-lg font-semibold",
          tone === "primary" && "text-primary",
          tone === "mint" && "text-mint-foreground",
          tone === "peach" && "text-peach-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function TrustItem({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
      <Icon className="h-3.5 w-3.5 text-success" />
      <span>{label}</span>
    </div>
  );
}
