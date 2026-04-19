import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  TrendingUp,
  CircleDollarSign,
  Coins,
  Receipt,
  Wallet,
  Download,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { AdminLayout } from "@/components/AdminLayout";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { adminRevenueQuery, downloadCsv, toCsv } from "@/lib/admin-queries-revenue";
import { formatCents } from "@/lib/format";
import { planLabel } from "@/lib/plans";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/beheer/dashboard/revenue")({
  head: () => ({ meta: [{ title: "Inkomsten — Platform" }] }),
  component: RevenuePage,
});

const PLAN_COLORS: Record<string, string> = {
  trial: "hsl(var(--muted-foreground))",
  starter: "hsl(var(--info))",
  pro: "hsl(var(--primary))",
  premium: "hsl(var(--pink-foreground))",
};

function RevenuePage() {
  const { t } = useT();
  const { data, isLoading } = useQuery(adminRevenueQuery());

  const chartData = useMemo(
    () =>
      (data?.monthly ?? []).map((m) => ({
        label: m.label,
        Abonnementen: m.subscription_cents / 100,
        Fees: m.fee_cents / 100,
        Totaal: (m.subscription_cents + m.fee_cents) / 100,
      })),
    [data],
  );

  const planPie = useMemo(
    () =>
      (data?.plan_distribution ?? [])
        .filter((p) => p.revenue_cents > 0)
        .map((p) => ({ name: planLabel(p.plan), value: p.revenue_cents / 100, plan: p.plan })),
    [data],
  );

  const exportCsv = () => {
    if (!data) return;
    const csv = toCsv(
      data.per_shop.map((r) => ({
        shop: r.shop_name,
        plan: r.plan,
        status: r.status,
        sub_month_eur: (r.subscription_revenue_month / 100).toFixed(2),
        fee_month_eur: (r.fee_revenue_month / 100).toFixed(2),
        sub_total_eur: (r.subscription_revenue_total / 100).toFixed(2),
        fee_total_eur: (r.fee_revenue_total / 100).toFixed(2),
        booking_payments: r.booking_payment_count,
      })),
      [
        { key: "shop", label: "Shop" },
        { key: "plan", label: "Plan" },
        { key: "status", label: "Status" },
        { key: "sub_month_eur", label: "Abonnement deze maand (EUR)" },
        { key: "fee_month_eur", label: "Fees deze maand (EUR)" },
        { key: "sub_total_eur", label: "Abonnement totaal (EUR)" },
        { key: "fee_total_eur", label: "Fees totaal (EUR)" },
        { key: "booking_payments", label: "Aantal boeking-betalingen" },
      ],
    );
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`flowybookings-revenue-${stamp}.csv`, csv);
  };

  return (
    <AdminLayout>
      <PageHeader
        title={t("adminRevenue.title")}
        description={t("adminRevenue.description")}
        actions={
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data}>
            <Download className="h-4 w-4" /> {t("adminRevenue.exportCsv")}
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)
        ) : (
          <>
            <StatCard
              label={t("adminRevenue.totalThisMonth")}
              value={formatCents(data?.total_month_cents ?? 0)}
              icon={CircleDollarSign}
              accent="primary"
            />
            <StatCard
              label={t("adminRevenue.subscriptionRevenue")}
              value={formatCents(data?.subscription_month_cents ?? 0)}
              icon={Receipt}
              accent="mint"
            />
            <StatCard
              label={t("adminRevenue.feeRevenue")}
              value={formatCents(data?.fee_month_cents ?? 0)}
              icon={Coins}
              accent="peach"
            />
            <StatCard
              label={t("adminRevenue.mrr")}
              value={formatCents(data?.mrr_cents ?? 0)}
              delta={t("adminRevenue.mrrHint")}
              icon={TrendingUp}
              accent="pink"
            />
            <StatCard
              label={t("adminRevenue.lifetime")}
              value={formatCents(data?.lifetime_total_cents ?? 0)}
              delta={t("adminRevenue.avgFee", {
                amount: formatCents(data?.avg_fee_per_txn_cents ?? 0),
              })}
              icon={Wallet}
              accent="info"
            />
          </>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold">{t("adminRevenue.last12Months")}</h2>
            <span className="text-xs text-muted-foreground">{t("adminRevenue.stackedByType")}</span>
          </div>
          <div className="h-72">
            {isLoading ? (
              <Skeleton className="h-full w-full rounded-xl" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 12,
                    }}
                    formatter={(v: number) => `€${v.toFixed(2)}`}
                  />
                  <Legend />
                  <Bar dataKey="Abonnementen" stackId="a" fill="hsl(var(--primary))" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Fees" stackId="a" fill="hsl(var(--peach-foreground))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <h2 className="mb-4 text-base font-semibold">{t("adminRevenue.byPlan")}</h2>
          <div className="h-72">
            {isLoading ? (
              <Skeleton className="h-full w-full rounded-xl" />
            ) : planPie.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {t("adminRevenue.noRevenueYet")}
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={planPie}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {planPie.map((entry) => (
                      <Cell key={entry.plan} fill={PLAN_COLORS[entry.plan] ?? "hsl(var(--primary))"} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 12,
                    }}
                    formatter={(v: number) => `€${v.toFixed(2)}`}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-soft">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{t("adminRevenue.mrrTrend")}</h2>
          <span className="text-xs text-muted-foreground">{t("adminRevenue.subscriptionsOnly")}</span>
        </div>
        <div className="h-64">
          {isLoading ? (
            <Skeleton className="h-full w-full rounded-xl" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 12,
                  }}
                  formatter={(v: number) => `€${v.toFixed(2)}`}
                />
                <Line
                  type="monotone"
                  dataKey="Abonnementen"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold">{t("adminRevenue.perShop")}</h2>
          <span className="text-xs text-muted-foreground">{t("adminRevenue.sortedByLifetime")}</span>
        </div>
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 text-left">{t("adminRevenue.shop")}</th>
                  <th className="px-6 py-3 text-left">{t("adminRevenue.plan")}</th>
                  <th className="px-6 py-3 text-right">{t("adminRevenue.subMonth")}</th>
                  <th className="px-6 py-3 text-right">{t("adminRevenue.feeMonth")}</th>
                  <th className="hidden px-6 py-3 text-right md:table-cell">{t("adminRevenue.subTotal")}</th>
                  <th className="hidden px-6 py-3 text-right md:table-cell">{t("adminRevenue.feeTotal")}</th>
                  <th className="hidden px-6 py-3 text-right lg:table-cell">{t("adminRevenue.txns")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(data?.per_shop ?? []).length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">
                      {t("adminRevenue.noShops")}
                    </td>
                  </tr>
                )}
                {(data?.per_shop ?? []).map((r) => (
                  <tr key={r.shop_id} className="hover:bg-muted/30">
                    <td className="px-6 py-3 font-medium">{r.shop_name}</td>
                    <td className="px-6 py-3 text-muted-foreground">{planLabel(r.plan)}</td>
                    <td className="px-6 py-3 text-right">{formatCents(r.subscription_revenue_month)}</td>
                    <td className="px-6 py-3 text-right">{formatCents(r.fee_revenue_month)}</td>
                    <td className="hidden px-6 py-3 text-right font-medium md:table-cell">
                      {formatCents(r.subscription_revenue_total)}
                    </td>
                    <td className="hidden px-6 py-3 text-right font-medium md:table-cell">
                      {formatCents(r.fee_revenue_total)}
                    </td>
                    <td className="hidden px-6 py-3 text-right text-muted-foreground lg:table-cell">
                      {r.booking_payment_count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
