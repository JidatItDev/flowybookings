import { createFileRoute } from "@tanstack/react-router";
import { Store, Users, CalendarRange, CircleDollarSign, TrendingUp, AlertTriangle } from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { platformMetrics, shops, supportTickets } from "@/lib/mock-data";
import { StatusBadge } from "@/components/StatusBadge";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/beheer/dashboard/")({
  head: () => ({ meta: [{ title: "Admin overview — Bookly" }] }),
  component: AdminOverview,
});

function AdminOverview() {
  return (
    <AdminLayout>
      <PageHeader title="Platform overview" description="The health of Bookly across all shops." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active shops" value="276" delta="+22 this month" trend="up" icon={Store} accent="primary" />
        <StatCard label="Total users" value="4,812" delta="+184 this month" trend="up" icon={Users} accent="mint" />
        <StatCard label="GMV (30d)" value="€165k" delta="+11.4% MoM" trend="up" icon={CircleDollarSign} accent="peach" />
        <StatCard label="Platform fees (30d)" value="€2,475" delta="+€255" trend="up" icon={TrendingUp} accent="pink" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">GMV & fees</h2>
              <p className="text-xs text-muted-foreground">Last 6 months</p>
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={platformMetrics}>
                <defs>
                  <linearGradient id="gmv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="fees" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-success)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--color-success)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 12 }} />
                <Area type="monotone" dataKey="gmv" stroke="var(--color-primary)" strokeWidth={2.5} fill="url(#gmv)" />
                <Area type="monotone" dataKey="fees" stroke="var(--color-success)" strokeWidth={2.5} fill="url(#fees)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 shadow-soft">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <h2 className="text-base font-semibold">Needs attention</h2>
          </div>
          <ul className="mt-4 space-y-3 text-sm">
            <li className="flex items-center justify-between"><span>Failed payments</span><span className="font-semibold">7</span></li>
            <li className="flex items-center justify-between"><span>Pending shop approvals</span><span className="font-semibold">3</span></li>
            <li className="flex items-center justify-between"><span>Open high-priority tickets</span><span className="font-semibold">2</span></li>
            <li className="flex items-center justify-between"><span>Suspended shops</span><span className="font-semibold">1</span></li>
          </ul>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card shadow-soft">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <h2 className="text-base font-semibold">Top shops by GMV</h2>
            <CalendarRange className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="divide-y divide-border">
            {[...shops].sort((a, b) => b.gmv - a.gmv).slice(0, 5).map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-6 py-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-warm text-xs font-semibold text-pink-foreground">
                  {s.name[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.type} · {s.city}</p>
                </div>
                <p className="text-sm font-semibold">€{s.gmv.toLocaleString("en-GB")}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card shadow-soft">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-base font-semibold">Recent support tickets</h2>
          </div>
          <div className="divide-y divide-border">
            {supportTickets.slice(0, 5).map((t) => (
              <div key={t.id} className="flex items-center justify-between px-6 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{t.subject}</p>
                  <p className="text-xs text-muted-foreground">{t.shop} · {t.updated}</p>
                </div>
                <StatusBadge status={t.status} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
