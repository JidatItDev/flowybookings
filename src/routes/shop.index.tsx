import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, Clock, CircleDollarSign, AlertCircle, Plus } from "lucide-react";
import { ShopLayout } from "@/components/ShopLayout";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { NoShopState } from "@/components/EmptyState";
import { useActiveShopId, useShopContext } from "@/lib/shop-context";
import { bookingsQuery, customersQuery, servicesQuery, staffQuery } from "@/lib/queries";
import { formatCents, formatTime, initials } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/shop/")({
  head: () => ({ meta: [{ title: "Dashboard — FlowyBookings" }] }),
  component: ShopDashboard,
});

function ShopDashboard() {
  const shopId = useActiveShopId();
  const { activeShop } = useShopContext();
  const { t } = useT();

  const { data: bookings = [] } = useQuery({ ...bookingsQuery(shopId ?? ""), enabled: !!shopId });
  const { data: customers = [] } = useQuery({ ...customersQuery(shopId ?? ""), enabled: !!shopId });
  const { data: services = [] } = useQuery({ ...servicesQuery(shopId ?? ""), enabled: !!shopId });
  const { data: staff = [] } = useQuery({ ...staffQuery(shopId ?? ""), enabled: !!shopId });

  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart); dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const todayBookings = bookings.filter((b) => { const d = new Date(b.starts_at); return d >= dayStart && d < dayEnd; });
  const todayRevenue = todayBookings.filter((b) => b.status !== "cancelled" && b.status !== "no_show").reduce((s, b) => s + b.price_cents, 0);
  const pendingCount = bookings.filter((b) => b.status === "pending").length;
  const noShows7d = bookings.filter((b) => { if (b.status !== "no_show") return false; const diff = Date.now() - new Date(b.starts_at).getTime(); return diff <= 7 * 86400000 && diff >= 0; }).length;

  // Real weekly revenue (last 7 days)
  const weekly = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - (6 - i));
    const next = new Date(d); next.setUTCDate(next.getUTCDate() + 1);
    const sum = bookings.filter((b) => { const t = new Date(b.starts_at).getTime(); return t >= d.getTime() && t < next.getTime() && b.status !== "cancelled" && b.status !== "no_show"; }).reduce((s, b) => s + b.price_cents, 0);
    return { day: d.toLocaleDateString("en-GB", { weekday: "short" }), revenue: Math.round(sum / 100) };
  });

  return (
    <ShopLayout>
      <PageHeader
        title={activeShop ? t("dashboard.welcomeBack", { name: activeShop.name }) : t("dashboard.title")}
        description={activeShop ? t("dashboard.subWithShop", { name: activeShop.name }) : t("dashboard.subNoShop")}
        actions={<Link to="/shop/calendar"><Button variant="hero"><Plus className="h-4 w-4" /> {t("dashboard.newBooking")}</Button></Link>}
      />
      {!shopId ? <NoShopState /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label={t("dashboard.todayBookings")} value={String(todayBookings.length)} icon={CalendarCheck} accent="primary" />
            <StatCard label={t("dashboard.todayRevenue")} value={formatCents(todayRevenue)} icon={CircleDollarSign} accent="mint" />
            <StatCard label={t("dashboard.pending")} value={String(pendingCount)} delta={t("dashboard.needsReview")} trend="neutral" icon={Clock} accent="peach" />
            <StatCard label={t("dashboard.noShows7d")} value={String(noShows7d)} icon={AlertCircle} accent="pink" />
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-soft lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <div><h2 className="text-base font-semibold">{t("dashboard.weeklyRevenue")}</h2><p className="text-xs text-muted-foreground">{t("dashboard.last7days")}</p></div>
                <span className="rounded-full bg-mint px-2.5 py-1 text-xs font-medium text-mint-foreground">{t("dashboard.live")}</span>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={weekly}>
                    <defs><linearGradient id="rev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.45} /><stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="day" stroke="var(--color-muted-foreground)" fontSize={12} />
                    <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                    <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 12 }} />
                    <Area type="monotone" dataKey="revenue" stroke="var(--color-primary)" strokeWidth={2.5} fill="url(#rev)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
              <h2 className="mb-4 text-base font-semibold">{t("dashboard.atAGlance")}</h2>
              <div className="space-y-3">
                <Stat label={t("dashboard.customers")} value={customers.length} />
                <Stat label={t("dashboard.activeServices")} value={services.filter((s) => s.is_active).length} />
                <Stat label={t("dashboard.activeStaff")} value={staff.filter((s) => s.is_active).length} />
                <Stat label={t("dashboard.totalBookings")} value={bookings.length} />
              </div>
            </div>
          </div>
          <div className="mt-6 rounded-2xl border border-border bg-card shadow-soft">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="text-base font-semibold">{t("dashboard.todayAppointments")}</h2>
              <Link to="/shop/calendar"><Button variant="ghost" size="sm">{t("dashboard.viewAll")}</Button></Link>
            </div>
            <div className="divide-y divide-border">
              {todayBookings.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm text-muted-foreground">{t("dashboard.noAppointments")}</p>
              ) : todayBookings.map((b) => {
                const cust = customers.find((c) => c.id === b.customer_id);
                const svc = services.find((s) => s.id === b.service_id);
                const stf = staff.find((s) => s.id === b.staff_id);
                return (
                  <div key={b.id} className="flex items-center gap-4 px-6 py-4">
                    <div className="hidden w-20 text-sm font-medium text-muted-foreground sm:block">{formatTime(b.starts_at)}</div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-warm text-sm font-semibold text-pink-foreground">{initials(cust?.full_name ?? "?")}</div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{cust?.full_name ?? t("dashboard.unknown")}</p>
                      <p className="truncate text-xs text-muted-foreground">{svc?.name ?? "—"} · {stf?.full_name ?? "—"}</p>
                    </div>
                    <StatusBadge status={b.status.replace("_", "-")} />
                    <p className="hidden w-20 text-right text-sm font-medium sm:block">{formatCents(b.price_cents)}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </ShopLayout>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (<div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">{label}</span><span className="text-lg font-semibold">{value}</span></div>);
}
