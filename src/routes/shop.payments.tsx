import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleDollarSign, ArrowDownToLine, RotateCcw, Wallet, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { ShopLayout } from "@/components/ShopLayout";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, NoShopState } from "@/components/EmptyState";
import { useActiveShopId } from "@/lib/shop-context";
import { paymentsQuery, bookingsQuery, customersQuery, shopKeys } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { formatCents, formatDate } from "@/lib/format";

export const Route = createFileRoute("/shop/payments")({
  head: () => ({ meta: [{ title: "Payments — Bookly" }] }),
  component: PaymentsPage,
});

const paymentStatuses = ["unpaid", "deposit_paid", "paid", "refunded", "failed"] as const;

function PaymentsPage() {
  const shopId = useActiveShopId();
  const qc = useQueryClient();

  const { data: payments = [], isLoading } = useQuery({
    ...paymentsQuery(shopId ?? ""),
    enabled: !!shopId,
  });
  const { data: bookings = [] } = useQuery({
    ...bookingsQuery(shopId ?? ""),
    enabled: !!shopId,
  });
  const { data: customers = [] } = useQuery({
    ...customersQuery(shopId ?? ""),
    enabled: !!shopId,
  });

  type PaymentStatus = (typeof paymentStatuses)[number];
  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: PaymentStatus }) => {
      const { error } = await supabase.from("payments").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payment updated");
      if (shopId) qc.invalidateQueries({ queryKey: shopKeys.payments(shopId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // KPI calc from live data
  const collected = payments
    .filter((p) => p.status === "paid" || p.status === "deposit_paid")
    .reduce((sum, p) => sum + p.amount_cents, 0);
  const refunds = payments
    .filter((p) => p.status === "refunded")
    .reduce((sum, p) => sum + p.amount_cents, 0);
  const pending = bookings
    .filter((b) => b.status !== "cancelled" && b.status !== "no_show")
    .reduce((sum, b) => sum + (b.price_cents - (b.deposit_cents ?? 0)), 0);
  const avgTx =
    payments.length > 0
      ? Math.round(payments.reduce((s, p) => s + p.amount_cents, 0) / payments.length)
      : 0;

  return (
    <ShopLayout>
      <PageHeader
        title="Payments"
        description="Track paid, unpaid and refunded transactions."
        actions={
          <>
            <Button variant="outline">
              <ArrowDownToLine className="h-4 w-4" /> Export
            </Button>
            <Button variant="hero">Connect Stripe</Button>
          </>
        }
      />

      {!shopId ? (
        <NoShopState />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Collected"
              value={formatCents(collected)}
              icon={CircleDollarSign}
              accent="mint"
            />
            <StatCard
              label="Pending balance"
              value={formatCents(pending)}
              icon={Wallet}
              accent="primary"
            />
            <StatCard
              label="Refunds"
              value={formatCents(refunds)}
              icon={RotateCcw}
              accent="pink"
            />
            <StatCard
              label="Avg. transaction"
              value={formatCents(avgTx)}
              icon={CircleDollarSign}
              accent="peach"
            />
          </div>

          <div className="mt-6 rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning-foreground">
            <p className="font-semibold">Stripe & Mollie integration coming soon</p>
            <p className="mt-1 text-xs opacity-80">
              Application fees per transaction will be supported on Pro and Premium plans.
            </p>
          </div>

          {isLoading ? (
            <div className="mt-6 h-72 animate-pulse rounded-2xl border border-border bg-card" />
          ) : payments.length === 0 ? (
            <div className="mt-6">
              <EmptyState
                icon={CreditCard}
                title="No payments yet"
                description="Payments appear here once customers pay or you mark a booking as paid."
              />
            </div>
          ) : (
            <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
              <div className="border-b border-border px-6 py-4">
                <h2 className="text-base font-semibold">Recent transactions</h2>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-6 py-3 text-left">Customer</th>
                    <th className="hidden px-6 py-3 text-left sm:table-cell">Booking</th>
                    <th className="px-6 py-3 text-left">Amount</th>
                    <th className="px-6 py-3 text-left">Status</th>
                    <th className="hidden px-6 py-3 text-left lg:table-cell">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {payments.map((p) => {
                    const booking = bookings.find((b) => b.id === p.booking_id);
                    const cust = customers.find((c) => c.id === booking?.customer_id);
                    return (
                      <tr key={p.id} className="hover:bg-muted/30">
                        <td className="px-6 py-4 font-medium">{cust?.full_name ?? "—"}</td>
                        <td className="hidden px-6 py-4 text-muted-foreground sm:table-cell">
                          {booking ? formatDate(booking.starts_at) : "—"}
                        </td>
                        <td className="px-6 py-4 font-medium">
                          {formatCents(p.amount_cents, p.currency)}
                        </td>
                        <td className="px-6 py-4">
                          <Select
                            value={p.status}
                            onValueChange={(v) =>
                              updateStatus.mutate({ id: p.id, status: v as PaymentStatus })
                            }
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
                        <td className="hidden px-6 py-4 text-muted-foreground lg:table-cell">
                          {formatDate(p.created_at)}
                        </td>
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
