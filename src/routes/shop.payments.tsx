import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleDollarSign, ArrowDownToLine, RotateCcw, Wallet, CreditCard, Receipt, Landmark, Banknote } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ShopLayout } from "@/components/ShopLayout";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, NoShopState } from "@/components/EmptyState";
import { MollieNudge } from "@/components/MollieNudge";
import { MollieConnectCard } from "@/components/MollieConnectCard";
import { useActiveShopId } from "@/lib/shop-context";
import { paymentsQuery, bookingsQuery, customersQuery, shopKeys } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { formatCents, formatDate } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { PLATFORM_PROVIDER } from "@/lib/platform-billing";

export const Route = createFileRoute("/shop/payments")({
  head: () => ({ meta: [{ title: "Booking payments — FlowyBookings" }] }),
  component: PaymentsPage,
});
const paymentStatuses = ["unpaid", "deposit_paid", "paid", "refunded", "failed"] as const;

function PaymentsPage() {
  const shopId = useActiveShopId();
  const qc = useQueryClient();
  const { t } = useT();
  const [statusFilter, setStatusFilter] = useState<"all" | "paid" | "pending" | "failed">("all");
  const { data: allPayments = [], isLoading } = useQuery({ ...paymentsQuery(shopId ?? ""), enabled: !!shopId });
  const { data: bookings = [] } = useQuery({ ...bookingsQuery(shopId ?? ""), enabled: !!shopId });
  const { data: customers = [] } = useQuery({ ...customersQuery(shopId ?? ""), enabled: !!shopId });

  // BOOKING PAYMENTS ONLY — strictly exclude platform subscription rows.
  // Subscription billing lives at /shop/billing (alias of /shop/upgrade).
  const allBookingPayments = allPayments.filter(
    (p) => p.provider !== PLATFORM_PROVIDER && p.booking_id !== null,
  );

  // Apply user-selected status filter
  const payments = allBookingPayments.filter((p) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "paid") return p.status === "paid" || p.status === "deposit_paid";
    if (statusFilter === "pending") return p.status === "unpaid";
    if (statusFilter === "failed") return p.status === "failed" || p.status === "refunded";
    return true;
  });

  type PaymentStatus = (typeof paymentStatuses)[number];
  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: PaymentStatus }) => {
      const { error } = await supabase.from("payments").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("payments.updated"));
      if (shopId) qc.invalidateQueries({ queryKey: shopKeys.payments(shopId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const collected = payments.filter((p) => p.status === "paid" || p.status === "deposit_paid").reduce((s, p) => s + p.amount_cents, 0);
  const refunds = payments.filter((p) => p.status === "refunded").reduce((s, p) => s + p.amount_cents, 0);
  const pending = bookings.filter((b) => b.status !== "cancelled" && b.status !== "no_show").reduce((s, b) => s + (b.price_cents - (b.deposit_cents ?? 0)), 0);
  const avgTx = payments.length > 0 ? Math.round(payments.reduce((s, p) => s + p.amount_cents, 0) / payments.length) : 0;

  return (
    <ShopLayout>
      <PageHeader
        title={t("shopPayments.title")}
        description={t("shopPayments.description")}
        actions={
          <Button variant="outline">
            <ArrowDownToLine className="h-4 w-4" /> {t("shopPayments.export")}
          </Button>
        }
      />
      {!shopId ? (
        <NoShopState />
      ) : (
        <>
          {/* Cross-link to subscription billing so the two systems are obviously separate */}
          <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-border bg-muted/30 px-4 py-3 text-xs">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Receipt className="h-4 w-4" />
              <span>{t("shopPayments.notSubscription")}</span>
            </div>
            <Link to="/shop/billing" className="font-medium text-primary hover:underline">
              {t("shopPayments.openBilling")} →
            </Link>
          </div>

          {/* Inline Mollie nudge (auto-hides when connected) */}
          <div className="mb-4">
            <MollieNudge shopId={shopId} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label={t("payments.collected")} value={formatCents(collected)} icon={CircleDollarSign} accent="mint" />
            <StatCard label={t("payments.pendingBalance")} value={formatCents(pending)} icon={Wallet} accent="primary" />
            <StatCard label={t("payments.refunds")} value={formatCents(refunds)} icon={RotateCcw} accent="pink" />
            <StatCard label={t("payments.avgTransaction")} value={formatCents(avgTx)} icon={CircleDollarSign} accent="peach" />
          </div>

          {/* Mollie Connect provider settings — booking payments only */}
          <div className="mt-6">
            <MollieConnectCard shopId={shopId} />
          </div>

          {/* Status filter pills */}
          <div className="mt-6 flex flex-wrap items-center gap-2">
            {([
              { k: "all", label: t("payments.filterAll") },
              { k: "paid", label: t("payments.filterPaid") },
              { k: "pending", label: t("payments.filterPending") },
              { k: "failed", label: t("payments.filterFailed") },
            ] as const).map((f) => (
              <button
                key={f.k}
                onClick={() => setStatusFilter(f.k)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium",
                  statusFilter === f.k ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="mt-4 h-72 animate-pulse rounded-2xl border border-border bg-card" />
          ) : payments.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                icon={CreditCard}
                title={t("payments.noPayments")}
                description={t("payments.noPaymentsDesc")}
              />
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
              <div className="border-b border-border px-6 py-4">
                <h2 className="text-base font-semibold">{t("payments.recentTransactions")}</h2>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-6 py-3 text-left">{t("payments.customer")}</th>
                    <th className="hidden px-6 py-3 text-left sm:table-cell">{t("payments.method")}</th>
                    <th className="hidden px-6 py-3 text-left md:table-cell">{t("payments.booking")}</th>
                    <th className="px-6 py-3 text-left">{t("payments.amount")}</th>
                    <th className="px-6 py-3 text-left">{t("payments.status")}</th>
                    <th className="hidden px-6 py-3 text-left lg:table-cell">{t("payments.date")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {payments.map((p) => {
                    const booking = bookings.find((b) => b.id === p.booking_id);
                    const cust = customers.find((c) => c.id === booking?.customer_id);
                    const meta = (p.metadata ?? {}) as { method?: string };
                    const method = (meta.method ?? p.provider ?? "—").toString();
                    const MethodIcon = method.toLowerCase().includes("ideal") ? Landmark : method.toLowerCase().includes("cash") ? Banknote : CreditCard;
                    return (
                      <tr key={p.id} className="hover:bg-muted/30">
                        <td className="px-6 py-4 font-medium">{cust?.full_name ?? "—"}</td>
                        <td className="hidden px-6 py-4 text-muted-foreground sm:table-cell">
                          <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs font-medium">
                            <MethodIcon className="h-3.5 w-3.5" /> {method}
                          </span>
                        </td>
                        <td className="hidden px-6 py-4 text-muted-foreground md:table-cell">{booking ? formatDate(booking.starts_at) : "—"}</td>
                        <td className="px-6 py-4 font-medium">{formatCents(p.amount_cents, p.currency)}</td>
                        <td className="px-6 py-4">
                          <Select
                            value={p.status}
                            onValueChange={(v) => updateStatus.mutate({ id: p.id, status: v as PaymentStatus })}
                          >
                            <SelectTrigger className="h-8 w-[140px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {paymentStatuses.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {s.replace("_", " ")}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="hidden px-6 py-4 text-muted-foreground lg:table-cell">{formatDate(p.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </ShopLayout>
  );
}
