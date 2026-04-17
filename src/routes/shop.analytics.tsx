import { createFileRoute } from "@tanstack/react-router";
import { TrendingUp, Users, CalendarCheck, Repeat } from "lucide-react";
import { ShopLayout } from "@/components/ShopLayout";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { revenueWeekly, revenueMonthly, services } from "@/lib/mock-data";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";

export const Route = createFileRoute("/shop/analytics")({
  head: () => ({ meta: [{ title: "Analytics — Bookly" }] }),
  component: AnalyticsPage,
});

const topServices = services
  .filter((s) => s.active)
  .map((s, i) => ({ name: s.name, bookings: 80 - i * 9 }))
  .slice(0, 5);

function AnalyticsPage() {
  return (
    <ShopLayout>
      <PageHeader title="Analytics" description="Trends, revenue, retention and what's working." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Revenue (30d)" value="€21,800" delta="+18% MoM" trend="up" icon={TrendingUp} accent="primary" />
        <StatCard label="Bookings (30d)" value="412" delta="+32 MoM" trend="up" icon={CalendarCheck} accent="mint" />
        <StatCard label="Returning customers" value="68%" delta="+4pp MoM" trend="up" icon={Repeat} accent="peach" />
        <StatCard label="No-show rate" value="3.2%" delta="-0.8pp" trend="up" icon={Users} accent="pink" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Monthly revenue" subtitle="Trailing 8 months">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenueMonthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Line type="monotone" dataKey="revenue" stroke="var(--color-primary)" strokeWidth={3} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Bookings by day" subtitle="This week">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueWeekly}>
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
                <Bar dataKey="bookings" fill="var(--color-primary)" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-soft">
        <h2 className="text-base font-semibold">Top services</h2>
        <p className="text-xs text-muted-foreground">Most booked in the last 30 days</p>
        <div className="mt-4 space-y-3">
          {topServices.map((s) => {
            const pct = (s.bookings / 80) * 100;
            return (
              <div key={s.name}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium">{s.name}</span>
                  <span className="text-muted-foreground">{s.bookings} bookings</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-gradient-brand"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </ShopLayout>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
      <div className="mb-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
