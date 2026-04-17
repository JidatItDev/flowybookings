import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Search, Plus, Ban, CheckCircle2, AlertTriangle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AdminLayout } from "@/components/AdminLayout";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { adminShopsQuery } from "@/lib/admin-queries";
import { formatCents, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type ShopStatus = Database["public"]["Enums"]["shop_status"];

export const Route = createFileRoute("/beheer/dashboard/shops")({
  head: () => ({ meta: [{ title: "Shops — Platform" }] }),
  component: ShopsPage,
});

const planColor: Record<string, string> = {
  trial: "bg-muted text-muted-foreground",
  starter: "bg-info/15 text-info-foreground",
  pro: "bg-primary-soft text-primary",
  premium: "bg-gradient-brand text-primary-foreground",
};

function ShopsPage() {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ShopStatus>("all");
  const { data: shops, isLoading } = useQuery(adminShopsQuery());
  const qc = useQueryClient();

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ShopStatus }) => {
      const { error } = await supabase.from("shops").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Shop status updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const list = (shops ?? []).filter(
    (s) =>
      (statusFilter === "all" || s.status === statusFilter) &&
      s.name.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <AdminLayout>
      <PageHeader
        title="Shops"
        description="Approve, suspend and oversee every shop on the platform."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex max-w-sm flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search shops…" className="h-10 flex-1 bg-transparent text-sm outline-none" />
        </div>
        {(["all", "active", "pending", "suspended"] as const).map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)} className={cn("rounded-full px-3 py-1.5 text-xs font-medium capitalize", statusFilter === s ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted")}>{s}</button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-6 py-3 text-left">Shop</th>
                <th className="hidden px-6 py-3 text-left md:table-cell">Owner</th>
                <th className="px-6 py-3 text-left">Plan</th>
                <th className="px-6 py-3 text-left">Status</th>
                <th className="hidden px-6 py-3 text-left lg:table-cell">Bookings</th>
                <th className="hidden px-6 py-3 text-left lg:table-cell">Revenue</th>
                <th className="hidden px-6 py-3 text-left xl:table-cell">Created</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.length === 0 && (
                <tr><td colSpan={8} className="px-6 py-8 text-center text-muted-foreground">No shops found.</td></tr>
              )}
              {list.map((s) => (
                <tr key={s.id} className="hover:bg-muted/30">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-warm text-xs font-semibold text-pink-foreground">{s.name[0]}</div>
                      <div>
                        <p className="font-medium">{s.name}</p>
                        <p className="text-xs text-muted-foreground">{s.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-6 py-4 text-muted-foreground md:table-cell">{s.owner_email ?? "—"}</td>
                  <td className="px-6 py-4"><span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium capitalize", planColor[s.plan] ?? planColor.trial)}>{s.plan}</span></td>
                  <td className="px-6 py-4"><StatusBadge status={s.status} /></td>
                  <td className="hidden px-6 py-4 lg:table-cell">{s.booking_count ?? 0}</td>
                  <td className="hidden px-6 py-4 font-medium lg:table-cell">{formatCents(s.revenue_cents ?? 0)}</td>
                  <td className="hidden px-6 py-4 text-muted-foreground xl:table-cell">{formatDate(s.created_at)}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {s.status === "suspended" ? (
                        <Button variant="ghost" size="sm" onClick={() => updateStatus.mutate({ id: s.id, status: "active" })} title="Reactivate">
                          <CheckCircle2 className="h-4 w-4 text-success-foreground" />
                        </Button>
                      ) : s.status === "pending" ? (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => updateStatus.mutate({ id: s.id, status: "active" })} title="Approve">
                            <CheckCircle2 className="h-4 w-4 text-success-foreground" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => updateStatus.mutate({ id: s.id, status: "suspended" })} title="Reject">
                            <Ban className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => updateStatus.mutate({ id: s.id, status: "suspended" })} title="Suspend">
                          <Ban className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
