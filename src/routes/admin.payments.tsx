import { createFileRoute } from "@tanstack/react-router";
import { CircleDollarSign, TrendingUp, RotateCcw, Wallet } from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { bookings, shops } from "@/lib/mock-data";

export const Route = createFileRoute("/admin/payments")({
  head: () => ({ meta: [{ title: "Payments — Admin" }] }),
  component: AdminPayments,
});

function AdminPayments() {
  return (
    <AdminLayout>
      <PageHeader title="Payments & revenue" description="Subscription revenue, transaction fees and shop payouts." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="GMV (30d)" value="€165,000" delta="+11.4% MoM" trend="up" icon={CircleDollarSign} accent="primary" />
        <StatCard label="Platform fees" value="€2,475" delta="+€255" trend="up" icon={TrendingUp} accent="mint" />
        <StatCard label="Subscription MRR" value="€11,820" delta="+€640 MoM" trend="up" icon={Wallet} accent="peach" />
        <StatCard label="Refunds" value="€420" delta="3 events" trend="neutral" icon={RotateCcw} accent="pink" />
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold">Recent transactions</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-6 py-3 text-left">Customer</th>
              <th className="hidden px-6 py-3 text-left md:table-cell">Shop</th>
              <th className="px-6 py-3 text-left">Amount</th>
              <th className="px-6 py-3 text-left">Fee</th>
              <th className="px-6 py-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {bookings.map((b, i) => (
              <tr key={b.id} className="hover:bg-muted/30">
                <td className="px-6 py-4 font-medium">{b.customer}</td>
                <td className="hidden px-6 py-4 text-muted-foreground md:table-cell">{shops[i % shops.length].name}</td>
                <td className="px-6 py-4 font-medium">€{b.price}</td>
                <td className="px-6 py-4 text-muted-foreground">€{(b.price * 0.01).toFixed(2)}</td>
                <td className="px-6 py-4"><StatusBadge status={b.payment} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
