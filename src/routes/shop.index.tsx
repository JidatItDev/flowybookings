import { createFileRoute } from "@tanstack/react-router";
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
import { bookings, revenueWeekly } from "@/lib/mock-data";
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
  const today = bookings.slice(0, 5);
  return (
    <ShopLayout>
      <PageHeader
        title="Good morning, Marco 👋"
        description="Here's what's happening at Inkwell Studio today."
        actions={
          <>
            <Button variant="outline">Export</Button>
            <Button variant="hero">
              <Plus className="h-4 w-4" /> New booking
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Today's bookings" value="12" delta="+3 vs yesterday" trend="up" icon={CalendarCheck} accent="primary" />
        <StatCard label="Today's revenue" value="€840" delta="+18% vs yesterday" trend="up" icon={CircleDollarSign} accent="mint" />
        <StatCard label="Pending" value="3" delta="Needs review" trend="neutral" icon={Clock} accent="peach" />
        <StatCard label="No-shows (7d)" value="2" delta="-1 vs last week" trend="up" icon={AlertCircle} accent="pink" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">Weekly revenue</h2>
              <p className="text-xs text-muted-foreground">Last 7 days</p>
            </div>
            <span className="rounded-full bg-mint px-2.5 py-1 text-xs font-medium text-mint-foreground">
              +24% WoW
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
                <Area type="monotone" dataKey="revenue" stroke="var(--color-primary)" strokeWidth={2.5} fill="url(#rev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold">Quick actions</h2>
          </div>
          <div className="space-y-2">
            {["New booking", "Add customer", "Add service", "Send broadcast", "View no-shows"].map((a) => (
              <button
                key={a}
                className="flex w-full items-center justify-between rounded-xl border border-border px-3 py-2.5 text-left text-sm hover:bg-muted/50"
              >
                {a}
                <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-card shadow-soft">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold">Today's appointments</h2>
          <Button variant="ghost" size="sm">View all</Button>
        </div>
        <div className="divide-y divide-border">
          {today.map((b) => (
            <div key={b.id} className="flex items-center gap-4 px-6 py-4">
              <div className="hidden w-20 text-sm font-medium text-muted-foreground sm:block">
                {new Date(b.date).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })}
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-warm text-sm font-semibold text-pink-foreground">
                {b.customer.split(" ").map((n) => n[0]).join("")}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{b.customer}</p>
                <p className="truncate text-xs text-muted-foreground">{b.service} · with {b.staff}</p>
              </div>
              <StatusBadge status={b.status} />
              <p className="hidden w-16 text-right text-sm font-medium sm:block">€{b.price}</p>
            </div>
          ))}
        </div>
      </div>
    </ShopLayout>
  );
}
