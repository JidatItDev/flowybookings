import { useMemo, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldCheck, ShieldX, Mail, Clock, AlertTriangle, Plus, Trash2 } from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { logActivity } from "@/lib/activity-log";
import { formatDate, relativeFromNow } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/beheer/dashboard/security")({
  head: () => ({ meta: [{ title: "Security & Access — Admin" }] }),
  component: SecurityPage,
});

const ADMIN_ROLES = ["super_admin", "admin", "support", "read_only_admin"] as const;
type AdminRoleName = (typeof ADMIN_ROLES)[number];

type AdminRoleRow = {
  id: string;
  user_id: string;
  role: AdminRoleName;
  label: string | null;
  expires_at: string | null;
  disabled_at: string | null;
  invited_by: string | null;
  created_at: string;
};

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  last_login_at: string | null;
};

type InviteRow = {
  id: string;
  email: string;
  role: AdminRoleName;
  label: string | null;
  expires_at: string | null;
  status: string;
  invited_by_email: string | null;
  accepted_user_id: string | null;
  created_at: string;
};

type LoginLogRow = {
  id: string;
  user_id: string | null;
  email: string | null;
  role: string | null;
  success: boolean;
  failure_reason: string | null;
  user_agent: string | null;
  ip_address: string | null;
  created_at: string;
};

function isExpiringSoon(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const ms = new Date(expiresAt).getTime() - Date.now();
  return ms > 0 && ms < 3 * 24 * 60 * 60 * 1000;
}
function isExpired(expiresAt: string | null): boolean {
  return !!expiresAt && new Date(expiresAt).getTime() <= Date.now();
}

function SecurityPage() {
  const { isAdminWriter, user: currentUser } = useAuth();
  const qc = useQueryClient();

  const adminsQuery = useQuery({
    queryKey: ["admin", "security", "admins"],
    queryFn: async () => {
      const { data: roles, error } = await supabase
        .from("user_roles")
        .select("id, user_id, role, label, expires_at, disabled_at, invited_by, created_at")
        .in("role", ADMIN_ROLES as unknown as string[])
        .order("created_at", { ascending: false });
      if (error) throw error;
      const userIds = Array.from(new Set((roles ?? []).map((r) => r.user_id)));
      let profiles: ProfileRow[] = [];
      if (userIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, email, full_name, last_login_at")
          .in("id", userIds);
        profiles = (profs ?? []) as ProfileRow[];
      }
      const profById = new Map(profiles.map((p) => [p.id, p]));
      return ((roles ?? []) as AdminRoleRow[]).map((r) => ({
        ...r,
        profile: profById.get(r.user_id) ?? null,
      }));
    },
  });

  const invitesQuery = useQuery({
    queryKey: ["admin", "security", "invites"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_invites")
        .select("id, email, role, label, expires_at, status, invited_by_email, accepted_user_id, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as InviteRow[];
    },
  });

  const loginsQuery = useQuery({
    queryKey: ["admin", "security", "logins"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_login_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as LoginLogRow[];
    },
    refetchInterval: 60_000,
  });

  const failedRecent = useMemo(() => {
    const since = Date.now() - 24 * 60 * 60 * 1000;
    return (loginsQuery.data ?? []).filter((l) => !l.success && new Date(l.created_at).getTime() > since);
  }, [loginsQuery.data]);

  // ── Mutations (best-effort UI; RLS still enforces super_admin writes) ──

  async function disableRoleRow(row: AdminRoleRow) {
    if (!isAdminWriter) return toast.error("Read-only admin cannot perform this action.");
    if (row.user_id === currentUser?.id) return toast.error("You cannot disable your own access.");
    const { error } = await supabase
      .from("user_roles")
      .update({ disabled_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) return toast.error(error.message);
    void logActivity({ entity: "admin_account", action: "disabled", metadata: { role_row_id: row.id, role: row.role } });
    toast.success("Access disabled");
    qc.invalidateQueries({ queryKey: ["admin", "security"] });
  }

  async function enableRoleRow(row: AdminRoleRow) {
    if (!isAdminWriter) return toast.error("Read-only admin cannot perform this action.");
    const { error } = await supabase
      .from("user_roles")
      .update({ disabled_at: null })
      .eq("id", row.id);
    if (error) return toast.error(error.message);
    void logActivity({ entity: "admin_account", action: "enabled", metadata: { role_row_id: row.id } });
    toast.success("Access re-enabled");
    qc.invalidateQueries({ queryKey: ["admin", "security"] });
  }

  async function deleteInvite(invite: InviteRow) {
    if (!isAdminWriter) return toast.error("Read-only admin cannot perform this action.");
    const { error } = await supabase.from("admin_invites").delete().eq("id", invite.id);
    if (error) return toast.error(error.message);
    void logActivity({ entity: "admin_invite", action: "revoked", metadata: { email: invite.email, role: invite.role } });
    toast.success("Invite revoked");
    qc.invalidateQueries({ queryKey: ["admin", "security", "invites"] });
  }

  return (
    <AdminLayout>
      <PageHeader
        title="Security & Access"
        description="Manage admin accounts, invites, and recent login activity."
      />

      {!isAdminWriter && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          <ShieldX className="h-4 w-4 text-amber-500" />
          <span>You have read-only access. Editing is disabled.</span>
        </div>
      )}

      {failedRecent.length >= 5 && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <span>{failedRecent.length} failed login attempts in the last 24h — review activity below.</span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <SectionCard title="Admin & test accounts" icon={ShieldCheck}>
            {adminsQuery.isLoading ? (
              <Skeleton className="h-24" />
            ) : (
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">User</th>
                      <th className="px-3 py-2 text-left">Role</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Last login</th>
                      <th className="px-3 py-2 text-left">Expires</th>
                      <th className="px-3 py-2 text-left">Created</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(adminsQuery.data ?? []).map((row) => {
                      const expired = isExpired(row.expires_at);
                      const disabled = !!row.disabled_at;
                      const expiringSoon = isExpiringSoon(row.expires_at);
                      const statusLabel = disabled
                        ? "Disabled"
                        : expired
                          ? "Expired"
                          : expiringSoon
                            ? `Expires in ${Math.ceil((new Date(row.expires_at!).getTime() - Date.now()) / 86400000)}d`
                            : "Active";
                      return (
                        <tr key={row.id} className="hover:bg-muted/30">
                          <td className="px-3 py-2">
                            <div className="font-medium">{row.profile?.full_name ?? row.profile?.email ?? row.user_id}</div>
                            <div className="text-xs text-muted-foreground">
                              {row.profile?.email}
                              {row.label ? <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">{row.label}</span> : null}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-xs capitalize">{row.role.replace("_", " ")}</td>
                          <td className="px-3 py-2">
                            <span className={cn(
                              "rounded-full px-2 py-0.5 text-[11px] font-medium",
                              disabled || expired
                                ? "bg-destructive/15 text-destructive"
                                : expiringSoon
                                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                                  : "bg-success/15 text-success-foreground",
                            )}>{statusLabel}</span>
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {row.profile?.last_login_at ? relativeFromNow(row.profile.last_login_at) : "—"}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {row.expires_at ? formatDate(row.expires_at) : "—"}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{formatDate(row.created_at)}</td>
                          <td className="px-3 py-2 text-right">
                            {row.role !== "super_admin" && (
                              disabled ? (
                                <Button size="sm" variant="ghost" disabled={!isAdminWriter} onClick={() => enableRoleRow(row)}>
                                  Enable
                                </Button>
                              ) : (
                                <Button size="sm" variant="ghost" disabled={!isAdminWriter} onClick={() => disableRoleRow(row)}>
                                  Disable
                                </Button>
                              )
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {(adminsQuery.data ?? []).length === 0 && (
                      <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">No admin accounts.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Pending & recent invites" icon={Mail}>
            {invitesQuery.isLoading ? (
              <Skeleton className="h-16" />
            ) : (invitesQuery.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No invites yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {(invitesQuery.data ?? []).map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between py-3 text-sm">
                    <div>
                      <div className="font-medium">{inv.email}</div>
                      <div className="text-xs text-muted-foreground">
                        {inv.role.replace("_", " ")} • {inv.status}
                        {inv.label ? ` • ${inv.label}` : ""}
                        {inv.expires_at ? ` • expires ${formatDate(inv.expires_at)}` : ""}
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" disabled={!isAdminWriter} onClick={() => deleteInvite(inv)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Recent login activity" icon={Clock}>
            {loginsQuery.isLoading ? (
              <Skeleton className="h-24" />
            ) : (
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">When</th>
                      <th className="px-3 py-2 text-left">Email</th>
                      <th className="px-3 py-2 text-left">Result</th>
                      <th className="px-3 py-2 text-left">Reason / device</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(loginsQuery.data ?? []).map((l) => (
                      <tr key={l.id} className={cn("hover:bg-muted/30", !l.success && "bg-destructive/5")}>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{relativeFromNow(l.created_at)}</td>
                        <td className="px-3 py-2 text-xs">{l.email ?? "—"}</td>
                        <td className="px-3 py-2 text-xs">
                          <span className={cn(
                            "rounded-full px-2 py-0.5 text-[11px] font-medium",
                            l.success ? "bg-success/15 text-success-foreground" : "bg-destructive/15 text-destructive",
                          )}>
                            {l.success ? "Success" : "Failed"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[280px]">
                          {l.failure_reason ?? l.user_agent?.split(" ").slice(-2).join(" ") ?? "—"}
                        </td>
                      </tr>
                    ))}
                    {(loginsQuery.data ?? []).length === 0 && (
                      <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">No login activity yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>

        <div className="space-y-6">
          <InviteForm onCreated={() => qc.invalidateQueries({ queryKey: ["admin", "security", "invites"] })} disabled={!isAdminWriter} />
          <RolePermissionsCard />
        </div>
      </div>
    </AdminLayout>
  );
}

function SectionCard({
  title, icon: Icon, children,
}: { title: string; icon: typeof ShieldCheck; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function RolePermissionsCard() {
  const items: { role: string; can: string[]; cannot: string[] }[] = [
    { role: "Super admin", can: ["Everything"], cannot: [] },
    { role: "Admin", can: ["Manage platform data", "Edit plans", "View logs"], cannot: ["Rotate secrets"] },
    { role: "Support", can: ["View shops & users", "Help troubleshoot"], cannot: ["Edit plans", "Change billing"] },
    { role: "Read-only admin", can: ["View dashboard, shops, plans, users, logs"], cannot: ["Edit anything", "Access secrets", "Change payments"] },
  ];
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
      <h2 className="mb-3 text-base font-semibold">Role permissions</h2>
      <ul className="space-y-3 text-xs">
        {items.map((it) => (
          <li key={it.role}>
            <div className="font-semibold text-sm">{it.role}</div>
            <div className="text-muted-foreground">
              <span className="text-success-foreground">Can:</span> {it.can.join(", ")}
              {it.cannot.length > 0 && (<>
                <br /><span className="text-destructive">Cannot:</span> {it.cannot.join(", ")}
              </>)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function InviteForm({ onCreated, disabled }: { onCreated: () => void; disabled: boolean }) {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRoleName>("read_only_admin");
  const [label, setLabel] = useState("External QA / Test Account");
  const [expiresInDays, setExpiresInDays] = useState<string>("7");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (disabled) return;
    setSubmitting(true);
    const expires = expiresInDays
      ? new Date(Date.now() + Number(expiresInDays) * 86400000).toISOString()
      : null;
    const { error } = await supabase.from("admin_invites").insert({
      email: email.trim().toLowerCase(),
      role,
      label: label || null,
      expires_at: expires,
      invited_by: user?.id ?? null,
      invited_by_email: user?.email ?? null,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    void logActivity({
      entity: "admin_invite",
      action: "created",
      metadata: { email, role, expires_at: expires, label },
    });
    toast.success("Invite created");
    setEmail("");
    onCreated();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-card p-6 shadow-soft">
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
        <Plus className="h-4 w-4" /> Invite test / admin account
      </h2>
      <div className="space-y-3">
        <div>
          <Label htmlFor="inv-email">Email</Label>
          <Input id="inv-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="qa@example.com" />
        </div>
        <div>
          <Label htmlFor="inv-role">Role</Label>
          <select
            id="inv-role"
            value={role}
            onChange={(e) => setRole(e.target.value as AdminRoleName)}
            className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="read_only_admin">Read-only admin (recommended for QA)</option>
            <option value="support">Support</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div>
          <Label htmlFor="inv-label">Label</Label>
          <Input id="inv-label" value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="inv-exp">Auto-expire (days)</Label>
          <Input id="inv-exp" type="number" min={0} value={expiresInDays} onChange={(e) => setExpiresInDays(e.target.value)} />
          <p className="mt-1 text-xs text-muted-foreground">Leave empty for no expiry. Default 7 days.</p>
        </div>
        <Button type="submit" disabled={disabled || submitting} className="w-full">
          {submitting ? "Creating…" : "Create invite"}
        </Button>
      </div>
    </form>
  );
}
