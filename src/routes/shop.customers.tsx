import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Search, Mail, Phone } from "lucide-react";
import { ShopLayout } from "@/components/ShopLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { customers } from "@/lib/mock-data";

export const Route = createFileRoute("/shop/customers")({
  head: () => ({ meta: [{ title: "Customers — Bookly" }] }),
  component: CustomersPage,
});

function CustomersPage() {
  const [q, setQ] = useState("");
  const list = customers.filter((c) =>
    [c.name, c.email, c.phone].some((f) => f.toLowerCase().includes(q.toLowerCase())),
  );
  return (
    <ShopLayout>
      <PageHeader
        title="Customers"
        description="Profiles, history and lifetime value."
        actions={
          <>
            <Button variant="outline">Import CSV</Button>
            <Button variant="hero">
              <Plus className="h-4 w-4" /> New customer
            </Button>
          </>
        }
      />

      <div className="mb-4 flex max-w-md items-center gap-2 rounded-xl border border-border bg-card px-3 shadow-xs">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search customers…"
          className="h-10 flex-1 bg-transparent text-sm outline-none"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-6 py-3 text-left">Customer</th>
              <th className="hidden px-6 py-3 text-left md:table-cell">Contact</th>
              <th className="px-6 py-3 text-left">Visits</th>
              <th className="hidden px-6 py-3 text-left sm:table-cell">Total spent</th>
              <th className="hidden px-6 py-3 text-left lg:table-cell">Last visit</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {list.map((c) => (
              <tr key={c.id} className="hover:bg-muted/30">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-warm text-xs font-semibold text-pink-foreground">
                      {c.name.split(" ").map((n) => n[0]).join("")}
                    </div>
                    <div>
                      <p className="font-medium">{c.name}</p>
                      {c.notes && <p className="text-xs text-muted-foreground">{c.notes}</p>}
                    </div>
                  </div>
                </td>
                <td className="hidden px-6 py-4 text-xs text-muted-foreground md:table-cell">
                  <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" />{c.email}</div>
                  <div className="mt-1 flex items-center gap-2"><Phone className="h-3.5 w-3.5" />{c.phone}</div>
                </td>
                <td className="px-6 py-4 font-medium">{c.visits}</td>
                <td className="hidden px-6 py-4 sm:table-cell">€{c.totalSpent.toLocaleString()}</td>
                <td className="hidden px-6 py-4 text-muted-foreground lg:table-cell">{c.lastVisit}</td>
                <td className="px-6 py-4 text-right">
                  <Button variant="ghost" size="sm">View</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ShopLayout>
  );
}
