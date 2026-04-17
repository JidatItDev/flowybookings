import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Users, CalendarCheck, Repeat } from "lucide-react";
import { ShopLayout } from "@/components/ShopLayout";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { NoShopState } from "@/components/EmptyState";
import { useActiveShopId } from "@/lib/shop-context";
import { bookingsQuery, paymentsQuery, customersQuery, servicesQuery } from "@/lib/queries";
import { formatCents } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line } from "recharts";

export const Route = createFileRoute("/shop/analytics")({
  head: () => ({ meta: [{ title: "Analytics — FlowyBookings" }] }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const { t } = useT();
  const shopId = useActiveShopId();

  const { data: bookings = [] } = useQuery({ ...bookingsQuery(shopId ?? ""), enabled: !!shopId });
  const { data: payments = [] } = useQuery({ ...paymentsQuery(shopId ?? ""), enabled: !!shopId });
  const { data: customers = [] } = useQuery({ ...customersQuery(shopId ?? ""), enabled: !!shopId });
  const { data: services = [] } = useQuery({ ...servicesQuery(shopId ?? ""), enabled: !!shopId });

  const now = Date.now();
  const last30 = now - 30 * 86400000;

  const bookings30 = bookings.filter((b) => new Date(b.starts_at).getTime() >= last30);
  const validRevenue = bookings30.filter((b) => b.status !== "cancelled" && b.status !== "no_show");
  const revenue30 = validRevenue.reduce((s, b) => s + b.price_cents, 0);
  const noShows30 = bookings30.filter((b) => b.status === "no_show").length;
  const noShowRate = bookings30.length > 0 ? (noShows30 / bookings30.length) * 100 : 0;

  // Returning customers: customers with 2+ bookings in window
  const customerBookingCount = new Map<string, number>();
  bookings30.forEach((b) => { if (b.customer_id) customerBookingCount.set(b.customer_id, (customerBookingCount.get(b.customer_id) ?? 0) + 1); });
  const returning = Array.from(customerBookingCount.values()).filter((c) => c >= 2).length;
  const totalUniqueCustomers = customerBookingCount.size;
  const returningPct = totalUniqueCustomers > 0 ? Math.round((returning / totalUniqueCustomers) * 100) : 0;

  // Monthly revenue (last 8 months)
  const monthlyRevenue: { month: string; revenue: number }[] = [];
  const today = new Date();
  for (let i = 7; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const next = new Date(today.getFullYear(), today.getMonth() - i + 1, 1);
    const sum = bookings.filter((b) => {
      const t = new Date(b.starts_at).getTime();
      return t >= d.getTime() && t < next.getTime() && b.status !== "cancelled" && b.status !== "no_show";
    }).reduce((s, b) => s + b.price_cents, 0);
    monthlyRevenue.push({ month: d.toLocaleString("en-GB", { month: "short" }), revenue: Math.round(sum / 100) });
  }

  // Bookings by day this week (Mon-Sun)
  const monday = new Date(today); const day = (monday.getDay() + 6) % 7; monday.setDate(monday.getDate() - day); monday.setHours(0, 0, 0, 0);
  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const weekDays = dayLabels.map((label, i) => {
    const start = new Date(monday); start.setDate(monday.getDate() + i);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    const count = bookings.filter((b) => { const t = new Date(b.starts_at).getTime(); return t >= start.getTime() && t < end.getTime(); }).length;
    return { day: label, bookings: count };
  });

  // Top services
  const svcCount = new Map<string, number>();
  bookings30.forEach((b) => { if (b.service_id) svcCount.set(b.service_id, (svcCount.get(b.service_id) ?? 0) + 1); });
  const topServices = Array.from(svcCount.entries())
    .map(([id, count]) => ({ name: services.find((s) => s.id === id)?.name ?? "—", bookings: count }))
    .sort((a, b) => b.bookings - a.bookings)
    .slice(0, 5);
  const maxTop = topServices[0]?.bookings ?? 1;

  const hasData = bookings.length > 0;

  return (
    <ShopLayout>
      <PageHeader title={t("analytics.title")} description={t("analytics.description")} />
      {!shopId ? <NoShopState /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label={t("analytics.revenue30d")} value={formatCents(revenue30)} icon={TrendingUp} accent="primary" />
            <StatCard label={t("analytics.bookings30d")} value={String(bookings30.length)} icon={CalendarCheck} accent="mint" />
            <StatCard label={t("analytics.returningCustomers")} value={`${returningPct}%`} icon={Repeat} accent="peach" />
            <StatCard label={t("analytics.noShowRate")} value={`${noShowRate.toFixed(1)}%`} icon={Users} accent="pink" />
          </div>
          {!hasData ? (
            <div className="mt-6 rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground shadow-soft">
              {t("analytics.noData")}
            </div>
          ) : (
            <>
              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <Card title={t("analytics.monthlyRevenue")} subtitle={t("analytics.trailing8months")}>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={monthlyRevenue}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                        <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} />
                        <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                        <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 12 }} />
                        <Line type="monotone" dataKey="revenue" stroke="var(--color-primary)" strokeWidth={3} dot={{ r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
                <Card title={t("analytics.bookingsByDay")} subtitle={t("analytics.thisWeek")}>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={weekDays}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                        <XAxis dataKey="day" stroke="var(--color-muted-foreground)" fontSize={12} />
                        <YAxis stroke="var(--color-muted-foreground)" fontSize={12} allowDecimals={false} />
                        <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 12 }} />
                        <Bar dataKey="bookings" fill="var(--color-primary)" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>
              {topServices.length > 0 && (
                <div className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-soft">
                  <h2 className="text-base font-semibold">{t("analytics.topServices")}</h2>
                  <p className="text-xs text-muted-foreground">{t("analytics.topServicesSub")}</p>
                  <div className="mt-4 space-y-3">
                    {topServices.map((s) => {
                      const pct = (s.bookings / maxTop) * 100;
                      return (
                        <div key={s.name}>
                          <div className="mb-1 flex items-center justify-between text-sm">
                            <span className="font-medium">{s.name}</span>
                            <span className="text-muted-foreground">{t("analytics.bookings", { n: s.bookings })}</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-gradient-brand" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <p className="mt-3 text-right text-[11px] text-muted-foreground">
                {t("analytics.basedOn", { bookings: bookings.length, payments: payments.length, customers: customers.length })}
              </p>
            </>
          )}
        </>
      )}
    </ShopLayout>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
      <div className="mb-3"><h2 className="text-base font-semibold">{title}</h2>{subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}</div>
      {children}
    </div>
  );
}
