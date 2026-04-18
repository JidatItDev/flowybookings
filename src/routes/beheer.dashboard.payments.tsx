import { createFileRoute } from "@tanstack/react-router";
import { CircleDollarSign, TrendingUp, RotateCcw, Wallet, Plug, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { adminPaymentsQuery, adminStatsQuery } from "@/lib/admin-queries";
import { adminPaymentProvidersQuery, type ConnectionStatus } from "@/lib/payment-providers";
import { formatCents, relativeFromNow } from "@/lib/format";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/beheer/dashboard/payments")({ head: () => ({ meta: [{ title: "Payments — Platform" }] }), component: AdminPayments });

function AdminPayments() {
  const { t } = useT();
  const { data: stats, isLoading: statsLoading } = useQuery(adminStatsQuery());
  const { data: payments, isLoading } = useQuery(adminPaymentsQuery());
  const { data: providers, isLoading: providersLoading } = useQuery(adminPaymentProvidersQuery());
  const refundedCount = (payments ?? []).filter((p) => p.status === "refunded").length;
  const refundedAmount = (payments ?? []).filter((p) => p.status === "refunded").reduce((s, p) => s + p.amount_cents, 0);

  return (
    <AdminLayout>
      <PageHeader title={t("adminPayments.title")} description={t("adminPayments.description")} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statsLoading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />) : (
          <>
            <StatCard label={t("adminPayments.totalRevenue")} value={formatCents(stats?.totalRevenue ?? 0)} trend="up" icon={CircleDollarSign} accent="primary" />
            <StatCard label={t("adminPayments.platformFees")} value={formatCents(stats?.totalFees ?? 0)} trend="up" icon={TrendingUp} accent="mint" />
            <StatCard label={t("adminPayments.totalTransactions")} value={String(payments?.length ?? 0)} trend="neutral" icon={Wallet} accent="peach" />
            <StatCard label={t("adminPayments.refunds")} value={formatCents(refundedAmount)} delta={t("adminPayments.events", { n: refundedCount })} trend="neutral" icon={RotateCcw} accent="pink" />
          </>
        )}
      </div>
      {isLoading ? <div className="mt-6 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div> : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <div className="border-b border-border px-6 py-4"><h2 className="text-base font-semibold">{t("adminPayments.allTransactions")}</h2></div>
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground"><tr>
              <th className="px-6 py-3 text-left">{t("adminPayments.shop")}</th><th className="px-6 py-3 text-left">{t("adminPayments.amount")}</th><th className="hidden px-6 py-3 text-left md:table-cell">{t("adminPayments.fee")}</th><th className="px-6 py-3 text-left">{t("adminPayments.status")}</th><th className="hidden px-6 py-3 text-left lg:table-cell">{t("adminPayments.provider")}</th><th className="hidden px-6 py-3 text-left xl:table-cell">{t("adminPayments.date")}</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {(payments ?? []).length === 0 && <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">{t("adminPayments.noPayments")}</td></tr>}
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
