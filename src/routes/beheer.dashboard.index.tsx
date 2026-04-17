import { createFileRoute } from "@tanstack/react-router";
import { Store, Users, CalendarRange, CircleDollarSign, TrendingUp, AlertTriangle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { adminStatsQuery, adminAttentionQuery, adminShopsQuery, adminBookingsQuery } from "@/lib/admin-queries";
import { formatCents, relativeFromNow } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/beheer/dashboard/")({ head: () => ({ meta: [{ title: "Platform overview — Bookly" }] }), component: AdminOverview });

function AdminOverview() {
  const { t } = useT();
  const { data: stats, isLoading: statsLoading } = useQuery(adminStatsQuery());
  const { data: attention } = useQuery(adminAttentionQuery());
  const { data: shops } = useQuery(adminShopsQuery());
  const { data: bookings } = useQuery(adminBookingsQuery());
  const topShops = [...(shops ?? [])].sort((a, b) => (b.revenue_cents ?? 0) - (a.revenue_cents ?? 0)).slice(0, 5);
  const recentBookings = (bookings ?? []).slice(0, 5);

  return (
    <AdminLayout>
      <PageHeader title={t("adminOverview.title")} description={t("adminOverview.description")} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statsLoading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />) : (
          <>
            <StatCard label={t("adminOverview.totalShops")} value={String(stats?.totalShops ?? 0)} delta={t("adminOverview.active", { n: shops?.filter((s) => s.status === "active").length ?? 0 })} trend="up" icon={Store} accent="primary" />
            <StatCard label={t("adminOverview.totalUsers")} value={String(stats?.totalUsers ?? 0)} trend="up" icon={Users} accent="mint" />
            <StatCard label={t("adminOverview.totalBookings")} value={String(stats?.totalBookings ?? 0)} trend="up" icon={CalendarRange} accent="peach" />
            <StatCard label={t("adminOverview.totalRevenue")} value={formatCents(stats?.totalRevenue ?? 0)} delta={t("adminOverview.fees", { amount: formatCents(stats?.totalFees ?? 0) })} trend="up" icon={CircleDollarSign} accent="pink" />
          </>
        )}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card shadow-soft lg:col-span-2">
          <div className="flex items-center justify-between border-b border-border px-6 py-4"><h2 className="text-base font-semibold">{t("adminOverview.topShops")}</h2><TrendingUp className="h-4 w-4 text-muted-foreground" /></div>
          <div className="divide-y divide-border">
            {topShops.length === 0 && <p className="px-6 py-6 text-sm text-muted-foreground">{t("adminOverview.noShops")}</p>}
            {topShops.map((s) => (<div key={s.id} className="flex items-center gap-3 px-6 py-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-warm text-xs font-semibold text-pink-foreground">{s.name[0]}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{s.name}</p><p className="text-xs text-muted-foreground">{s.plan} · {s.booking_count ?? 0} bookings</p></div><p className="text-sm font-semibold">{formatCents(s.revenue_cents ?? 0)}</p></div>))}
          </div>
        </div>
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 shadow-soft">
          <div className="flex items-center gap-2 text-destructive"><AlertTriangle className="h-4 w-4" /><h2 className="text-base font-semibold">{t("adminOverview.needsAttention")}</h2></div>
          <ul className="mt-4 space-y-3 text-sm">
            <li className="flex items-center justify-between"><span>{t("adminOverview.failedPayments")}</span><span className="font-semibold">{attention?.failedPayments ?? 0}</span></li>
            <li className="flex items-center justify-between"><span>{t("adminOverview.pendingApprovals")}</span><span className="font-semibold">{attention?.pendingShops ?? 0}</span></li>
            <li className="flex items-center justify-between"><span>{t("adminOverview.suspendedShops")}</span><span className="font-semibold">{attention?.suspendedShops ?? 0}</span></li>
            <li className="flex items-center justify-between"><span>{t("adminOverview.noShowsLabel")}</span><span className="font-semibold">{attention?.noShows ?? 0}</span></li>
          </ul>
        </div>
      </div>
      <div className="mt-6 rounded-2xl border border-border bg-card shadow-soft">
        <div className="border-b border-border px-6 py-4"><h2 className="text-base font-semibold">{t("adminOverview.recentBookings")}</h2></div>
        <div className="divide-y divide-border">
          {recentBookings.length === 0 && <p className="px-6 py-6 text-sm text-muted-foreground">{t("adminOverview.noBookings")}</p>}
          {recentBookings.map((b) => (<div key={b.id} className="flex items-center justify-between px-6 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{b.customer_name ?? t("adminOverview.walkIn")} · {b.service_name ?? "—"}</p><p className="text-xs text-muted-foreground">{b.shop_name} · {relativeFromNow(b.starts_at)}</p></div><div className="flex items-center gap-2"><span className="text-sm font-medium">{formatCents(b.price_cents, b.currency)}</span><StatusBadge status={b.status} /></div></div>))}
        </div>
      </div>
    </AdminLayout>
  );
}
