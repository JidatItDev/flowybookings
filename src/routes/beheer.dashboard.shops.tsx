import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Search, Plus } from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { shops } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/beheer/dashboard/shops")({
  head: () => ({ meta: [{ title: "Shops — Admin" }] }),
  component: ShopsPage,
});

const planColor: Record<string, string> = {
  Trial: "bg-muted text-muted-foreground",
  Starter: "bg-info/15 text-info-foreground",
  Pro: "bg-primary-soft text-primary",
  Premium: "bg-gradient-brand text-primary-foreground",
};

function ShopsPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "suspended" | "pending">("all");
  const list = shops.filter(
    (s) => (status === "all" || s.status === status) && s.name.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <AdminLayout>
      <PageHeader
        title="Shops"
        description="Approve, suspend and oversee every shop on the platform."
        actions={<Button variant="hero"><Plus className="h-4 w-4" /> Invite shop</Button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex max-w-sm flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search shops…" className="h-10 flex-1 bg-transparent text-sm outline-none" />
        </div>
        {(["all", "active", "pending", "suspended"] as const).map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={cn("rounded-full px-3 py-1.5 text-xs font-medium capitalize", status === s ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted")}>{s}</button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-6 py-3 text-left">Shop</th>
              <th className="hidden px-6 py-3 text-left md:table-cell">Owner</th>
              <th className="px-6 py-3 text-left">Plan</th>
              <th className="px-6 py-3 text-left">Status</th>
              <th className="hidden px-6 py-3 text-left lg:table-cell">Bookings</th>
              <th className="hidden px-6 py-3 text-left lg:table-cell">GMV</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {list.map((s) => (
              <tr key={s.id} className="hover:bg-muted/30">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-warm text-xs font-semibold text-pink-foreground">{s.name[0]}</div>
                    <div>
                      <p className="font-medium">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.type} · {s.city}</p>
                    </div>
                  </div>
                </td>
                <td className="hidden px-6 py-4 text-muted-foreground md:table-cell">{s.owner}</td>
                <td className="px-6 py-4"><span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", planColor[s.plan])}>{s.plan}</span></td>
                <td className="px-6 py-4"><StatusBadge status={s.status} /></td>
                <td className="hidden px-6 py-4 lg:table-cell">{s.bookings}</td>
                <td className="hidden px-6 py-4 font-medium lg:table-cell">€{s.gmv.toLocaleString("en-GB")}</td>
                <td className="px-6 py-4 text-right"><Button variant="ghost" size="sm">Manage</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
