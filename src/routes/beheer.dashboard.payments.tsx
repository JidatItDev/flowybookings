import { createFileRoute } from "@tanstack/react-router";
import { CircleDollarSign, TrendingUp, RotateCcw, Wallet } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { adminPaymentsQuery, adminStatsQuery } from "@/lib/admin-queries";
import { formatCents, relativeFromNow } from "@/lib/format";

export const Route = createFileRoute("/beheer/dashboard/payments")({
  head: () => ({ meta: [{ title: "Payments — Platform" }] }),
  component: AdminPayments,
});

function AdminPayments() {
  const { data: stats, isLoading: statsLoading } = useQuery(adminStatsQuery());
  const { data: payments, isLoading } = useQuery(adminPaymentsQuery());

  const refundedCount = (payments ?? []).filter((p) => p.status === "refunded").length;
  const refundedAmount = (payments ?? []).filter((p) => p.status === "refunded").reduce((s, p) => s + p.amount_cents, 0);

  return (
    <AdminLayout>
      <PageHeader title="Payments & revenue" description="Transaction revenue, platform fees and refunds across all shops." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)
        ) : (
          <>
            <StatCard label="Total revenue" value={formatCents(stats?.totalRevenue ?? 0)} trend="up" icon={CircleDollarSign} accent="primary" />
            <StatCard label="Platform fees" value={formatCents(stats?.totalFees ?? 0)} trend="up" icon={TrendingUp} accent="mint" />
            <StatCard label="Total transactions" value={String(payments?.length ?? 0)} trend="neutral" icon={Wallet} accent="peach" />
            <StatCard label="Refunds" value={formatCents(refundedAmount)} delta={`${refundedCount} events`} trend="neutral" icon={RotateCcw} accent="pink" />
          </>
        )}
      </div>

      {isLoading ? (
        <div className="mt-6 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-base font-semibold">All transactions</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-6 py-3 text-left">Shop</th>
                <th className="px-6 py-3 text-left">Amount</th>
                <th className="hidden px-6 py-3 text-left md:table-cell">Fee</th>
                <th className="px-6 py-3 text-left">Status</th>
                <th className="hidden px-6 py-3 text-left lg:table-cell">Provider</th>
                <th className="hidden px-6 py-3 text-left xl:table-cell">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(payments ?? []).length === 0 && (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">No payments yet.</td></tr>
              )}
              {(payments ?? []).map((p) => (
                <tr key={p.id} className="hover:bg-muted/30">
                  <td className="px-6 py-4 font-medium">{p.shop_name ?? "—"}</td>
                  <td className="px-6 py-4 font-medium">{formatCents(p.amount_cents, p.currency)}</td>
                  <td className="hidden px-6 py-4 text-muted-foreground md:table-cell">{formatCents(p.application_fee_cents, p.currency)}</td>
                  <td className="px-6 py-4"><StatusBadge status={p.status} /></td>
                  <td className="hidden px-6 py-4 text-muted-foreground lg:table-cell">{p.provider ?? "—"}</td>
                  <td className="hidden px-6 py-4 text-muted-foreground xl:table-cell">{relativeFromNow(p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
