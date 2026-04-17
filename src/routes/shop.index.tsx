import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarCheck,
  Clock,
  CircleDollarSign,
  AlertCircle,
  Plus,
  ArrowUpRight,
} from "lucide-react";
import { ShopLayout } from "@/components/ShopLayout";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { NoShopState } from "@/components/EmptyState";
import { useActiveShopId, useShopContext } from "@/lib/shop-context";
import { bookingsQuery, customersQuery, servicesQuery, staffQuery } from "@/lib/queries";
import { formatCents, formatTime, initials } from "@/lib/format";
import { revenueWeekly } from "@/lib/mock-data";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/shop/")({
  head: () => ({ meta: [{ title: "Dashboard — Bookly" }] }),
  component: ShopDashboard,
});

function ShopDashboard() {
  const shopId = useActiveShopId();
  const { activeShop } = useShopContext();

  const { data: bookings = [] } = useQuery({
    ...bookingsQuery(shopId ?? ""),
    enabled: !!shopId,
  });
  const { data: customers = [] } = useQuery({
    ...customersQuery(shopId ?? ""),
    enabled: !!shopId,
  });
  const { data: services = [] } = useQuery({
    ...servicesQuery(shopId ?? ""),
    enabled: !!shopId,
  });
  const { data: staff = [] } = useQuery({
    ...staffQuery(shopId ?? ""),
    enabled: !!shopId,
  });

  // Today's stats — UTC day window for SSR/CSR stability
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const todayBookings = bookings.filter((b) => {
    const t = new Date(b.starts_at);
    return t >= dayStart && t < dayEnd;
  });
  const todayRevenue = todayBookings
    .filter((b) => b.status !== "cancelled" && b.status !== "no_show")
    .reduce((sum, b) => sum + b.price_cents, 0);
  const pendingCount = bookings.filter((b) => b.status === "pending").length;
  const noShows7d = bookings.filter((b) => {
    if (b.status !== "no_show") return false;
    const diff = Date.now() - new Date(b.starts_at).getTime();
    return diff <= 7 * 86400000 && diff >= 0;
  }).length;

  return (
    <ShopLayout>
      <PageHeader
        title={activeShop ? `Welcome back, ${activeShop.name} 👋` : "Dashboard"}
        description={
          activeShop
            ? `Here's what's happening today at ${activeShop.name}.`
            : "Pick a shop to see today's activity."
        }
        actions={
          <Button variant="hero">
            <Plus className="h-4 w-4" /> New booking
          </Button>
        }
      />

      {!shopId ? (
        <NoShopState />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Today's bookings"
              value={String(todayBookings.length)}
              icon={CalendarCheck}
              accent="primary"
            />
            <StatCard
              label="Today's revenue"
              value={formatCents(todayRevenue)}
              icon={CircleDollarSign}
              accent="mint"
            />
            <StatCard
              label="Pending"
              value={String(pendingCount)}
              delta="Needs review"
              trend="neutral"
              icon={Clock}
              accent="peach"
            />
            <StatCard
              label="No-shows (7d)"
              value={String(noShows7d)}
              icon={AlertCircle}
              accent="pink"
            />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-soft lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold">Weekly revenue</h2>
                  <p className="text-xs text-muted-foreground">Last 7 days (sample)</p>
                </div>
                <span className="rounded-full bg-mint px-2.5 py-1 text-xs font-medium text-mint-foreground">
                  Live preview
                </span>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueWeekly}>
                    <defs>
                      <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="day" stroke="var(--color-muted-foreground)" fontSize={12} />
                    <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--color-card)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 12,
                        fontSize: 12,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="var(--color-primary)"
                      strokeWidth={2.5}
                      fill="url(#rev)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
              <h2 className="mb-4 text-base font-semibold">At a glance</h2>
              <div className="space-y-3">
                <Stat label="Customers" value={customers.length} />
                <Stat label="Active services" value={services.filter((s) => s.is_active).length} />
                <Stat label="Active staff" value={staff.filter((s) => s.is_active).length} />
                <Stat label="Total bookings" value={bookings.length} />
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-border bg-card shadow-soft">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="text-base font-semibold">Today's appointments</h2>
              <Button variant="ghost" size="sm">
                View all
              </Button>
            </div>
            <div className="divide-y divide-border">
              {todayBookings.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm text-muted-foreground">
                  No appointments today.
                </p>
              ) : (
                todayBookings.map((b) => {
                  const cust = customers.find((c) => c.id === b.customer_id);
                  const svc = services.find((s) => s.id === b.service_id);
                  const stf = staff.find((s) => s.id === b.staff_id);
                  return (
                    <div key={b.id} className="flex items-center gap-4 px-6 py-4">
                      <div className="hidden w-20 text-sm font-medium text-muted-foreground sm:block">
                        {formatTime(b.starts_at)}
                      </div>
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-warm text-sm font-semibold text-pink-foreground">
                        {initials(cust?.full_name ?? "?")}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{cust?.full_name ?? "Unknown"}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {svc?.name ?? "—"} · with {stf?.full_name ?? "—"}
                        </p>
                      </div>
                      <StatusBadge status={b.status.replace("_", "-")} />
                      <p className="hidden w-20 text-right text-sm font-medium sm:block">
                        {formatCents(b.price_cents)}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </ShopLayout>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold">{value}</span>
    </div>
  );
}
