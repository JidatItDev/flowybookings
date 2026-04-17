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

export const Route = createFileRoute("/beheer/dashboard/")({
  head: () => ({ meta: [{ title: "Platform overview — Bookly" }] }),
  component: AdminOverview,
});

function AdminOverview() {
  const { data: stats, isLoading: statsLoading } = useQuery(adminStatsQuery());
  const { data: attention } = useQuery(adminAttentionQuery());
  const { data: shops } = useQuery(adminShopsQuery());
  const { data: bookings } = useQuery(adminBookingsQuery());

  const topShops = [...(shops ?? [])].sort((a, b) => (b.revenue_cents ?? 0) - (a.revenue_cents ?? 0)).slice(0, 5);
  const recentBookings = (bookings ?? []).slice(0, 5);

  return (
    <AdminLayout>
      <PageHeader title="Platform overview" description="The health of Bookly across all shops." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)
        ) : (
          <>
            <StatCard label="Total shops" value={String(stats?.totalShops ?? 0)} delta={`${shops?.filter((s) => s.status === "active").length ?? 0} active`} trend="up" icon={Store} accent="primary" />
            <StatCard label="Total users" value={String(stats?.totalUsers ?? 0)} trend="up" icon={Users} accent="mint" />
            <StatCard label="Total bookings" value={String(stats?.totalBookings ?? 0)} trend="up" icon={CalendarRange} accent="peach" />
            <StatCard label="Total revenue" value={formatCents(stats?.totalRevenue ?? 0)} delta={`${formatCents(stats?.totalFees ?? 0)} fees`} trend="up" icon={CircleDollarSign} accent="pink" />
          </>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Top shops by revenue */}
        <div className="rounded-2xl border border-border bg-card shadow-soft lg:col-span-2">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <h2 className="text-base font-semibold">Top shops by revenue</h2>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="divide-y divide-border">
            {topShops.length === 0 && (
              <p className="px-6 py-6 text-sm text-muted-foreground">No shops yet.</p>
            )}
            {topShops.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-6 py-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-warm text-xs font-semibold text-pink-foreground">
                  {s.name[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.plan} · {s.booking_count ?? 0} bookings</p>
                </div>
                <p className="text-sm font-semibold">{formatCents(s.revenue_cents ?? 0)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Attention panel */}
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 shadow-soft">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <h2 className="text-base font-semibold">Needs attention</h2>
          </div>
          <ul className="mt-4 space-y-3 text-sm">
            <li className="flex items-center justify-between"><span>Failed payments</span><span className="font-semibold">{attention?.failedPayments ?? 0}</span></li>
            <li className="flex items-center justify-between"><span>Pending shop approvals</span><span className="font-semibold">{attention?.pendingShops ?? 0}</span></li>
            <li className="flex items-center justify-between"><span>Suspended shops</span><span className="font-semibold">{attention?.suspendedShops ?? 0}</span></li>
            <li className="flex items-center justify-between"><span>No-shows</span><span className="font-semibold">{attention?.noShows ?? 0}</span></li>
          </ul>
        </div>
      </div>

      {/* Recent bookings */}
      <div className="mt-6 rounded-2xl border border-border bg-card shadow-soft">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold">Recent bookings</h2>
        </div>
        <div className="divide-y divide-border">
          {recentBookings.length === 0 && (
            <p className="px-6 py-6 text-sm text-muted-foreground">No bookings yet.</p>
          )}
          {recentBookings.map((b) => (
            <div key={b.id} className="flex items-center justify-between px-6 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{b.customer_name ?? "Walk-in"} · {b.service_name ?? "—"}</p>
                <p className="text-xs text-muted-foreground">{b.shop_name} · {relativeFromNow(b.starts_at)}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{formatCents(b.price_cents, b.currency)}</span>
                <StatusBadge status={b.status} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
