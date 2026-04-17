import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Search, ShieldAlert, UserX } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AdminLayout } from "@/components/AdminLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { adminUsersQuery } from "@/lib/admin-queries";
import { relativeFromNow } from "@/lib/format";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/beheer/dashboard/users")({ head: () => ({ meta: [{ title: "Users — Platform" }] }), component: UsersPage });

function UsersPage() {
  const { t } = useT();
  const [q, setQ] = useState(""); const [roleFilter, setRoleFilter] = useState<string>("all");
  const { data: users, isLoading } = useQuery(adminUsersQuery()); const qc = useQueryClient();
  const removeRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => { const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role as any); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin"] }); toast.success(t("adminUsers.roleRemoved")); },
    onError: (e) => toast.error(e.message),
  });
  const filtered = (users ?? []).filter((u) => { const matchQ = (u.full_name ?? u.email ?? "").toLowerCase().includes(q.toLowerCase()); const matchRole = roleFilter === "all" || u.roles.some((r) => r.role === roleFilter); return matchQ && matchRole; });
  const roleOptions = ["all", "super_admin", "shop_owner", "staff", "customer"];

  return (
    <AdminLayout>
      <PageHeader title={t("adminUsers.title")} description={t("adminUsers.description")} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex max-w-sm flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3"><Search className="h-4 w-4 text-muted-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("adminUsers.searchPlaceholder")} className="h-10 flex-1 bg-transparent text-sm outline-none" /></div>
        {roleOptions.map((r) => <button key={r} onClick={() => setRoleFilter(r)} className={cn("rounded-full px-3 py-1.5 text-xs font-medium capitalize", roleFilter === r ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted")}>{r === "all" ? t("adminUsers.all") : r.replace("_", " ")}</button>)}
      </div>
      {isLoading ? <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div> : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground"><tr>
              <th className="px-6 py-3 text-left">{t("adminUsers.user")}</th><th className="hidden px-6 py-3 text-left md:table-cell">{t("adminUsers.roles")}</th><th className="hidden px-6 py-3 text-left lg:table-cell">{t("adminUsers.linkedShops")}</th><th className="hidden px-6 py-3 text-left xl:table-cell">{t("adminUsers.joined")}</th><th className="px-6 py-3" />
            </tr></thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 && <tr><td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">{t("adminUsers.noUsers")}</td></tr>}
              {filtered.map((u) => (
                <tr key={u.id} className="hover:bg-muted/30">
                  <td className="px-6 py-4"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-brand text-xs font-semibold text-primary-foreground">{(u.full_name ?? u.email ?? "?").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}</div><div><p className="font-medium">{u.full_name ?? "—"}</p><p className="text-xs text-muted-foreground">{u.email}</p></div></div></td>
                  <td className="hidden px-6 py-4 md:table-cell"><div className="flex flex-wrap gap-1">{u.roles.length === 0 && <span className="text-xs text-muted-foreground">{t("adminUsers.noRole")}</span>}{u.roles.map((r, i) => <span key={i} className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize", r.role === "super_admin" ? "bg-destructive/15 text-destructive" : "bg-secondary text-secondary-foreground")}>{r.role === "super_admin" && <ShieldAlert className="h-3 w-3" />}{r.role.replace("_", " ")}</span>)}</div></td>
                  <td className="hidden px-6 py-4 text-muted-foreground lg:table-cell">{u.roles.filter((r) => r.shop_name).map((r) => r.shop_name).join(", ") || "—"}</td>
                  <td className="hidden px-6 py-4 text-muted-foreground xl:table-cell">{relativeFromNow(u.created_at)}</td>
                  <td className="px-6 py-4 text-right">{u.roles.some((r) => r.role !== "super_admin") && <Button variant="ghost" size="sm" onClick={() => { u.roles.filter((r) => r.role !== "super_admin").forEach((r) => { removeRole.mutate({ userId: u.id, role: r.role }); }); }}><UserX className="h-4 w-4 text-destructive" /></Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
