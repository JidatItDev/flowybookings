import { Fragment, useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { Search, Ban, CheckCircle2, ChevronDown, LogIn } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AdminLayout } from "@/admin/shell/AdminLayout";
import { PageHeader } from "@/shared/components/PageHeader";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShopOverridesPanel } from "@/admin/shops/ShopOverridesPanel";
import { adminShopsQuery } from "@/admin/shared/admin-queries";
import { formatCents, formatDate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useT } from "@/shared/lib/i18n";
import { useAuth } from "@/auth/lib/auth-context";
import { startImpersonate } from "@/admin/impersonation/impersonation";
import { changeShopPlan, ALL_DB_PLANS, planLabel, type DbPlan } from "@/shared/lib/plans";

type ShopStatus = Database["public"]["Enums"]["shop_status"];
const planColor: Record<string, string> = { trial: "bg-muted text-muted-foreground", starter: "bg-info/15 text-info-foreground", pro: "bg-primary-soft text-primary", premium: "bg-gradient-brand text-primary-foreground" };

export function ShopsPage() {
  const { t } = useT();
  const { user, setActiveShopId } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState(""); const [statusFilter, setStatusFilter] = useState<"all" | ShopStatus>("all");
  const [policyFilter, setPolicyFilter] = useState<"all" | "accepted" | "missing">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data: shops, isLoading } = useQuery(adminShopsQuery()); const qc = useQueryClient();
  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ShopStatus }) => { const { error } = await supabase.from("shops").update({ status }).eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin"] }); toast.success(t("adminShops.updated")); },
    onError: (e) => toast.error(e.message),
  });
  const updatePlan = useMutation({
    mutationFn: async ({ id, plan, prev }: { id: string; plan: DbPlan; prev: string }) => {
      await changeShopPlan({ shopId: id, newPlan: plan, previousPlan: prev, actorUserId: user?.id ?? null, actorEmail: user?.email ?? null, source: "admin" });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin"] }); toast.success(t("adminShops.planUpdated")); },
    onError: (e: Error) => toast.error(e.message),
  });
  const list = (shops ?? []).filter((s) => {
    if (statusFilter !== "all" && s.status !== statusFilter) return false;
    if (policyFilter === "accepted" && !s.policy_accepted_at) return false;
    if (policyFilter === "missing" && s.policy_accepted_at) return false;
    return s.name.toLowerCase().includes(q.toLowerCase());
  });
  const policyDateFmt = new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "short", year: "numeric" });
  const sourceLabel = (src: string): string => {
    const map: Record<string, string> = { fresha: "Fresha", salonized: "Salonized", treatwell: "Treatwell", simplybook: "SimplyBook", planity: "Planity", csv: "CSV", manual: t("customers.sourceManual"), booking_page: t("customers.sourceBookingPage") };
    return map[src] ?? src;
  };

  return (
    <AdminLayout>
      <PageHeader title={t("adminShops.title")} description={t("adminShops.description")} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex max-w-sm flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3"><Search className="h-4 w-4 text-muted-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("adminShops.searchPlaceholder")} className="h-10 flex-1 bg-transparent text-sm outline-none" /></div>
        {(["all", "active", "pending", "suspended"] as const).map((s) => <button key={s} onClick={() => setStatusFilter(s)} className={cn("rounded-full px-3 py-1.5 text-xs font-medium capitalize", statusFilter === s ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted")}>{s === "all" ? t("adminShops.all") : s}</button>)}
        <div className="ml-2 h-6 w-px bg-border" />
        {(["all", "accepted", "missing"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPolicyFilter(p)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium",
              policyFilter === p ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted",
            )}
            title={t(`adminShops.policyFilter.${p}`)}
          >
            {t(`adminShops.policyFilter.${p}`)}
          </button>
        ))}
      </div>
      {isLoading ? <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div> : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground"><tr>
              <th className="px-6 py-3 text-left">{t("adminShops.shop")}</th><th className="hidden px-6 py-3 text-left md:table-cell">{t("adminShops.owner")}</th><th className="px-6 py-3 text-left">{t("adminShops.plan")}</th><th className="px-6 py-3 text-left">{t("adminShops.status")}</th><th className="hidden px-6 py-3 text-left lg:table-cell">{t("adminShops.bookings")}</th><th className="hidden px-6 py-3 text-left lg:table-cell">{t("adminShops.revenue")}</th><th className="hidden px-6 py-3 text-left xl:table-cell">{t("adminShops.lastLogin")}</th><th className="hidden px-6 py-3 text-left xl:table-cell">{t("adminShops.activity")}</th><th className="hidden px-6 py-3 text-left xl:table-cell">{t("adminShops.policyAccepted")}</th><th className="hidden px-6 py-3 text-left xl:table-cell">{t("adminShops.created")}</th><th className="px-6 py-3" />
            </tr></thead>
            <tbody className="divide-y divide-border">
              {list.length === 0 && <tr><td colSpan={11} className="px-6 py-8 text-center text-muted-foreground">{t("adminShops.noShops")}</td></tr>}
              {list.map((s) => {
                const isExpanded = expandedId === s.id;
                return (
                  <Fragment key={s.id}>
                    <tr className="hover:bg-muted/30">
                      <td className="px-6 py-4"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-warm text-xs font-semibold text-pink-foreground">{s.name[0]}</div><div><Link to="/beheer/dashboard/shops/$shopId" params={{ shopId: s.id }} className="font-medium hover:text-primary hover:underline">{s.name}</Link><p className="text-xs text-muted-foreground">{s.slug}</p></div></div></td>
                      <td className="hidden px-6 py-4 text-muted-foreground md:table-cell"><div className="leading-tight"><p className="text-foreground">{s.owner_name ?? "—"}</p><p className="text-xs">{s.owner_email ?? "—"}</p></div></td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium capitalize", planColor[s.plan] ?? planColor.trial)}>{planLabel(s.plan)}</span>
                          <select
                            aria-label="Change plan"
                            value={s.plan}
                            disabled={updatePlan.isPending}
                            onChange={(e) => updatePlan.mutate({ id: s.id, plan: e.target.value as DbPlan, prev: s.plan })}
                            className="h-7 rounded-md border border-border bg-background px-1 text-xs"
                          >
                            {ALL_DB_PLANS.map((p) => <option key={p} value={p}>{planLabel(p)}</option>)}
                          </select>
                        </div>
                      </td>
                      <td className="px-6 py-4"><StatusBadge status={s.status} /></td>
                      <td className="hidden px-6 py-4 lg:table-cell">{s.booking_count ?? 0}</td>
                      <td className="hidden px-6 py-4 font-medium lg:table-cell">{formatCents(s.revenue_cents ?? 0)}</td>
                      <td className="hidden px-6 py-4 text-muted-foreground xl:table-cell">{s.owner_last_login_at ? formatDate(s.owner_last_login_at) : "—"}</td>
                      <td className="hidden px-6 py-4 xl:table-cell">
                        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", s.is_active_recently ? "bg-success/15 text-success-foreground" : "bg-muted text-muted-foreground")}>
                          <span className={cn("h-1.5 w-1.5 rounded-full", s.is_active_recently ? "bg-success-foreground" : "bg-muted-foreground")} />
                          {s.is_active_recently ? t("adminShops.activityActive") : t("adminShops.activityInactive")}
                        </span>
                      </td>
                      <td className="hidden px-6 py-4 xl:table-cell">
                        {s.policy_accepted_at
                          ? <span className="inline-flex items-center gap-1 text-success-foreground" title={s.policy_version ?? ""}>✅ {policyDateFmt.format(new Date(s.policy_accepted_at))}</span>
                          : <span className="inline-flex items-center gap-1 text-destructive">❌ {t("adminShops.policyMissing")}</span>}
                      </td>
                      <td className="hidden px-6 py-4 text-muted-foreground xl:table-cell">{formatDate(s.created_at)}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              startImpersonate(
                                { shopId: s.id, shopName: s.name },
                                { userId: user?.id ?? null, email: user?.email ?? null },
                              );
                              setActiveShopId(s.id);
                              navigate({ to: "/shop" });
                            }}
                            aria-label={`Login als ${s.name}`}
                            title={`Login als ${s.name}`}
                          >
                            <LogIn className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setExpandedId((cur) => (cur === s.id ? null : s.id))}
                            aria-label={isExpanded ? "Verberg plan & overrides" : "Toon plan & overrides"}
                            aria-expanded={isExpanded}
                          >
                            <ChevronDown className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-180")} />
                          </Button>
                          {s.status === "suspended" ? <Button variant="ghost" size="sm" onClick={() => updateStatus.mutate({ id: s.id, status: "active" })}><CheckCircle2 className="h-4 w-4 text-success-foreground" /></Button>
                           : s.status === "pending" ? <><Button variant="ghost" size="sm" onClick={() => updateStatus.mutate({ id: s.id, status: "active" })}><CheckCircle2 className="h-4 w-4 text-success-foreground" /></Button><Button variant="ghost" size="sm" onClick={() => updateStatus.mutate({ id: s.id, status: "suspended" })}><Ban className="h-4 w-4 text-destructive" /></Button></>
                           : <Button variant="ghost" size="sm" onClick={() => updateStatus.mutate({ id: s.id, status: "suspended" })}><Ban className="h-4 w-4 text-destructive" /></Button>}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-muted/10">
                        <td colSpan={11} className="px-4 py-4 sm:px-6">
                          <div className="mb-3 grid gap-3 sm:grid-cols-2">
                            <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm">
                              {s.policy_accepted_at ? (
                                <p className="text-foreground">
                                  ✅ <span className="font-medium">{t("adminShops.policyAcceptedOn")}:</span>{" "}
                                  <span className="text-muted-foreground">{policyDateFmt.format(new Date(s.policy_accepted_at))}</span>
                                  {s.policy_version && <span className="ml-2 text-xs text-muted-foreground">(v{s.policy_version})</span>}
                                </p>
                              ) : (
                                <p className="font-medium text-destructive">⚠️ {t("adminShops.policyNotAcceptedWarning")}</p>
                              )}
                            </div>
                            <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm">
                              <p className="font-medium">
                                {t("adminShops.customersStat", {
                                  total: String(s.customer_count ?? 0),
                                  imported: String(s.imported_customer_count ?? 0),
                                })}
                              </p>
                              {s.customer_sources && Object.keys(s.customer_sources).length > 0 && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {Object.entries(s.customer_sources)
                                    .sort((a, b) => b[1] - a[1])
                                    .map(([src, n]) => `${sourceLabel(src)}: ${n}`)
                                    .join(" · ")}
                                </p>
                              )}
                            </div>
                          </div>
                          <ShopOverridesPanel shopId={s.id} shopName={s.name} plan={s.plan} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
