import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Search, ShieldAlert } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { PageHeader } from "@/components/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { adminUsersQuery } from "@/lib/admin-queries";
import { formatDate, relativeFromNow } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/beheer/dashboard/users")({
  head: () => ({ meta: [{ title: "Users — Platform" }] }),
  component: UsersPage,
});

function UsersPage() {
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const { data: users, isLoading } = useQuery(adminUsersQuery());

  const filtered = (users ?? []).filter((u) => {
    const text = (u.full_name ?? "") + " " + (u.email ?? "");
    if (q && !text.toLowerCase().includes(q.toLowerCase())) return false;
    if (roleFilter !== "all" && u.primary_role !== roleFilter) return false;
    if (planFilter !== "all" && u.primary_plan !== planFilter) return false;
    if (statusFilter === "active" && !u.is_active_recently) return false;
    if (statusFilter === "inactive" && u.is_active_recently) return false;
    return true;
  });

  const roles = ["all", "super_admin", "shop_owner", "staff", "customer", "none"];
  const plans = ["all", "trial", "starter", "pro", "premium"];

  return (
    <AdminLayout>
      <PageHeader title="Gebruikers" description="Alle geregistreerde gebruikers — filter op rol, plan of activiteit." />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex max-w-sm flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek op naam of e-mail…" className="h-10 flex-1 bg-transparent text-sm outline-none" />
        </div>
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="h-10 rounded-xl border border-border bg-card px-3 text-sm">
          {roles.map((r) => <option key={r} value={r}>{r === "all" ? "Alle rollen" : r.replace("_", " ")}</option>)}
        </select>
        <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)} className="h-10 rounded-xl border border-border bg-card px-3 text-sm">
          {plans.map((p) => <option key={p} value={p}>{p === "all" ? "Alle plannen" : p}</option>)}
        </select>
        {(["all", "active", "inactive"] as const).map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)} className={cn("rounded-full px-3 py-1.5 text-xs font-medium capitalize", statusFilter === s ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted")}>
            {s === "all" ? "Alle" : s === "active" ? "Actief (14d)" : "Inactief"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-6 py-3 text-left">Gebruiker</th>
                <th className="hidden px-6 py-3 text-left md:table-cell">Rol</th>
                <th className="hidden px-6 py-3 text-left lg:table-cell">Shop</th>
                <th className="hidden px-6 py-3 text-left lg:table-cell">Plan</th>
                <th className="hidden px-6 py-3 text-left xl:table-cell">Geregistreerd</th>
                <th className="hidden px-6 py-3 text-left xl:table-cell">Laatste login</th>
                <th className="px-6 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 && <tr><td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">Geen gebruikers gevonden</td></tr>}
              {filtered.map((u) => (
                <tr key={u.id} className="hover:bg-muted/30">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-brand text-xs font-semibold text-primary-foreground">
                        {(u.full_name ?? u.email ?? "?").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium">{u.full_name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-6 py-4 md:table-cell">
                    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                      u.primary_role === "super_admin" ? "bg-destructive/15 text-destructive" : "bg-secondary text-secondary-foreground")}>
                      {u.primary_role === "super_admin" && <ShieldAlert className="h-3 w-3" />}
                      {u.primary_role.replace("_", " ")}
                    </span>
                  </td>
                  <td className="hidden px-6 py-4 lg:table-cell">
                    {u.primary_shop_id ? (
                      <Link to="/beheer/dashboard/shops/$shopId" params={{ shopId: u.primary_shop_id }} className="text-primary hover:underline">
                        {u.primary_shop_name}
                      </Link>
                    ) : "—"}
                  </td>
                  <td className="hidden px-6 py-4 capitalize text-muted-foreground lg:table-cell">{u.primary_plan ?? "—"}</td>
                  <td className="hidden px-6 py-4 text-muted-foreground xl:table-cell">{formatDate(u.created_at)}</td>
                  <td className="hidden px-6 py-4 text-muted-foreground xl:table-cell">{u.last_login_at ? relativeFromNow(u.last_login_at) : "—"}</td>
                  <td className="px-6 py-4">
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium",
                      u.is_active_recently ? "bg-success/15 text-success-foreground" : "bg-muted text-muted-foreground")}>
                      {u.is_active_recently ? "Actief" : "Inactief"}
                    </span>
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
