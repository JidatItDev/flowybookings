import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "@/components/AdminLayout";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { bookings, shops } from "@/lib/mock-data";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/admin/bookings")({
  head: () => ({ meta: [{ title: "Bookings — Admin" }] }),
  component: AdminBookings,
});

function AdminBookings() {
  return (
    <AdminLayout>
      <PageHeader title="All bookings" description="Investigate disputes, no-shows and cancellations across every shop." />
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-6 py-3 text-left">Booking</th>
              <th className="hidden px-6 py-3 text-left md:table-cell">Shop</th>
              <th className="hidden px-6 py-3 text-left lg:table-cell">When</th>
              <th className="px-6 py-3 text-left">Status</th>
              <th className="px-6 py-3 text-left">Payment</th>
              <th className="px-6 py-3 text-left">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {bookings.map((b, i) => (
              <tr key={b.id} className="hover:bg-muted/30">
                <td className="px-6 py-4">
                  <p className="font-medium">{b.customer}</p>
                  <p className="text-xs text-muted-foreground">{b.service}</p>
                </td>
                <td className="hidden px-6 py-4 text-muted-foreground md:table-cell">{shops[i % shops.length].name}</td>
                <td className="hidden px-6 py-4 text-muted-foreground lg:table-cell">{formatDateTime(b.date)}</td>
                <td className="px-6 py-4"><StatusBadge status={b.status} /></td>
                <td className="px-6 py-4"><StatusBadge status={b.payment} /></td>
                <td className="px-6 py-4 font-medium">€{b.price}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
