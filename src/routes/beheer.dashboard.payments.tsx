import { createFileRoute } from "@tanstack/react-router";
import { CircleDollarSign, TrendingUp, RotateCcw, Wallet, Plug, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AdminLayout } from "@/components/AdminLayout";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { adminPaymentsQuery, adminStatsQuery } from "@/lib/admin-queries";
import { adminPaymentProvidersQuery, paymentProviderKeys, type ConnectionStatus } from "@/lib/payment-providers";
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
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {statsLoading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />) : (
          <>
            <StatCard label={t("adminPayments.totalRevenue")} value={formatCents(stats?.totalRevenue ?? 0)} trend="up" icon={CircleDollarSign} accent="primary" />
            <StatCard label={t("adminPayments.platformFees")} value={formatCents(stats?.totalFees ?? 0)} trend="up" icon={TrendingUp} accent="mint" />
            <StatCard label={t("adminPayments.totalTransactions")} value={String(payments?.length ?? 0)} trend="neutral" icon={Wallet} accent="peach" />
            <StatCard label={t("adminPayments.refunds")} value={formatCents(refundedAmount)} delta={t("adminPayments.events", { n: refundedCount })} trend="neutral" icon={RotateCcw} accent="pink" />
          </>
        )}
      </div>

      {/* Mollie Connect — provider status per shop */}
      <div className="mt-6 rounded-2xl border border-border bg-card shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">{t("adminProviders.title")}</h2>
            <p className="text-xs text-muted-foreground">{t("adminProviders.description")}</p>
          </div>
          <span className="flex-none rounded-full bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary">Mollie Connect</span>
        </div>
        {providersLoading ? (
          <div className="space-y-2 p-4 sm:p-6">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
        ) : (providers ?? []).length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground sm:px-6">{t("adminProviders.empty")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {(providers ?? []).map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.shop_name ?? "—"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t("adminProviders.account")}: {p.provider_account_id ?? "—"} · {t("adminProviders.fee")}: {p.application_fee_enabled ? `${p.application_fee_percent}%` : t("common.no")}
                  </p>
                </div>
                <ProviderStatusPill status={p.connection_status} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {isLoading ? <div className="mt-6 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div> : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-card shadow-soft">
          <div className="border-b border-border px-4 py-4 sm:px-6"><h2 className="text-base font-semibold">{t("adminPayments.allTransactions")}</h2></div>
          <table className="w-full min-w-[480px] text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground"><tr>
              <th className="px-4 py-3 text-left sm:px-6">{t("adminPayments.shop")}</th><th className="px-4 py-3 text-left sm:px-6">{t("adminPayments.amount")}</th><th className="hidden px-6 py-3 text-left md:table-cell">{t("adminPayments.fee")}</th><th className="px-4 py-3 text-left sm:px-6">{t("adminPayments.status")}</th><th className="hidden px-6 py-3 text-left lg:table-cell">{t("adminPayments.provider")}</th><th className="hidden px-6 py-3 text-left xl:table-cell">{t("adminPayments.date")}</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {(payments ?? []).length === 0 && <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">{t("adminPayments.noPayments")}</td></tr>}
              {(payments ?? []).map((p) => (
                <tr key={p.id} className="hover:bg-muted/30">
                  <td className="px-4 py-4 font-medium sm:px-6">{p.shop_name ?? "—"}</td>
                  <td className="px-4 py-4 font-medium sm:px-6">{formatCents(p.amount_cents, p.currency)}</td>
                  <td className="hidden px-6 py-4 text-muted-foreground md:table-cell">{formatCents(p.application_fee_cents, p.currency)}</td>
                  <td className="px-4 py-4 sm:px-6"><StatusBadge status={p.status} /></td>
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

function ProviderStatusPill({ status }: { status: ConnectionStatus }) {
  const { t } = useT();
  const map: Record<ConnectionStatus, { cls: string; icon: React.ReactNode }> = {
    not_connected: { cls: "bg-muted text-muted-foreground", icon: <Plug className="h-3.5 w-3.5" /> },
    pending: { cls: "bg-peach text-peach-foreground", icon: <Loader2 className="h-3.5 w-3.5 animate-spin" /> },
    connected: { cls: "bg-mint text-mint-foreground", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    disconnected: { cls: "bg-muted text-muted-foreground", icon: <Plug className="h-3.5 w-3.5" /> },
    error: { cls: "bg-destructive/15 text-destructive", icon: <AlertCircle className="h-3.5 w-3.5" /> },
  };
  const cfg = map[status];
  return (
    <span className={`inline-flex flex-none items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${cfg.cls}`}>
      {cfg.icon}
      {t(`mollie.status.${status}`)}
    </span>
  );
}
