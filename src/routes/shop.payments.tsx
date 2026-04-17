import { createFileRoute } from "@tanstack/react-router";
import { CircleDollarSign, ArrowDownToLine, RotateCcw, Wallet } from "lucide-react";
import { ShopLayout } from "@/components/ShopLayout";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { bookings } from "@/lib/mock-data";

export const Route = createFileRoute("/shop/payments")({
  head: () => ({ meta: [{ title: "Payments — Bookly" }] }),
  component: PaymentsPage,
});

function PaymentsPage() {
  return (
    <ShopLayout>
      <PageHeader
        title="Payments"
        description="Track paid, unpaid and refunded transactions."
        actions={
          <>
            <Button variant="outline">
              <ArrowDownToLine className="h-4 w-4" /> Export
            </Button>
            <Button variant="hero">Connect Stripe</Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Collected this month" value="€8,420" delta="+12% MoM" trend="up" icon={CircleDollarSign} accent="mint" />
        <StatCard label="Pending payouts" value="€1,240" icon={Wallet} accent="primary" />
        <StatCard label="Refunds (30d)" value="€180" icon={RotateCcw} accent="pink" />
        <StatCard label="Avg. transaction" value="€68" delta="+€4 vs last mo" trend="up" icon={CircleDollarSign} accent="peach" />
      </div>

      <div className="mt-6 rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning-foreground">
        <p className="font-semibold">Stripe & Mollie integration coming soon</p>
        <p className="mt-1 text-xs opacity-80">
          Application fees per transaction will be supported on the Pro and Premium plans.
        </p>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold">Recent transactions</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-6 py-3 text-left">Customer</th>
              <th className="hidden px-6 py-3 text-left sm:table-cell">Service</th>
              <th className="px-6 py-3 text-left">Amount</th>
              <th className="px-6 py-3 text-left">Status</th>
              <th className="hidden px-6 py-3 text-left lg:table-cell">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {bookings.map((b) => (
              <tr key={b.id} className="hover:bg-muted/30">
                <td className="px-6 py-4 font-medium">{b.customer}</td>
                <td className="hidden px-6 py-4 text-muted-foreground sm:table-cell">{b.service}</td>
                <td className="px-6 py-4 font-medium">€{b.price}</td>
                <td className="px-6 py-4"><StatusBadge status={b.payment} /></td>
                <td className="hidden px-6 py-4 text-muted-foreground lg:table-cell">
                  {new Date(b.date).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ShopLayout>
  );
}
