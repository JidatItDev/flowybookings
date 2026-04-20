import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, CalendarRange, Pencil, Trash2, UserCog, Check } from "lucide-react";
import { toast } from "sonner";
import { ShopLayout } from "@/components/ShopLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { EmptyState, LoadingGrid, NoShopState } from "@/components/EmptyState";
import { UpgradeNudge } from "@/components/UpgradeNudge";
import { FeatureLock } from "@/components/FeatureLock";
import { useImpersonationReadOnly, assertNotImpersonating } from "@/components/ImpersonationBanner";
import { useActiveShopId, useShopContext } from "@/lib/shop-context";
import { staffQuery, servicesQuery, shopKeys } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { useFeatureAccess } from "@/lib/use-feature-access";

export const Route = createFileRoute("/shop/staff")({ head: () => ({ meta: [{ title: "Staff — FlowyBookings" }] }), component: StaffPage });
type StaffRow = { id: string; full_name: string; email: string | null; phone: string | null; is_active: boolean; working_hours: unknown };

function StaffPage() {
  const shopId = useActiveShopId(); const qc = useQueryClient(); const { t } = useT();
  const { activeShop } = useShopContext();
  const staffAccess = useFeatureAccess(shopId, "max_staff");
  // Source of truth for the limit comes from plan_features via the RPC.
  // Fall back to legacy hard-coded values until the access query loads.
  const planLimit: number = staffAccess.data?.limit ?? (
    !activeShop || activeShop.plan === "trial" ? 1
    : activeShop.plan === "starter" ? 3
    : activeShop.plan === "pro" ? 10
    : Number.POSITIVE_INFINITY
  );
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<StaffRow | null>(null);
  const { data: staff = [], isLoading } = useQuery({ ...staffQuery(shopId ?? ""), enabled: !!shopId });
  const { data: services = [] } = useQuery({ ...servicesQuery(shopId ?? ""), enabled: !!shopId });
  const { data: links = [] } = useQuery({ queryKey: ["staff_services", shopId], queryFn: async () => { const { data, error } = await supabase.from("staff_services").select("*"); if (error) throw error; return data ?? []; }, enabled: !!shopId });
  const atOrOverLimit = staffAccess.data ? !staffAccess.data.allowed : (Number.isFinite(planLimit) && staff.length >= planLimit);

  const toggleActive = useMutation({
    mutationFn: async (s: StaffRow) => { const { error } = await supabase.from("staff").update({ is_active: !s.is_active }).eq("id", s.id); if (error) throw error; },
    onSuccess: () => { if (shopId) qc.invalidateQueries({ queryKey: shopKeys.staff(shopId) }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("staff").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success(t("staff.removed")); setDeleting(null); if (shopId) qc.invalidateQueries({ queryKey: shopKeys.staff(shopId) }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const serviceNamesFor = (staffId: string) => { const ids = new Set(links.filter((l) => l.staff_id === staffId).map((l) => l.service_id)); return services.filter((s) => ids.has(s.id)).map((s) => s.name); };

  return (
    <ShopLayout>
      <PageHeader
        title={t("staff.title")}
        description={t("staff.description")}
        actions={
          <Button
            variant="hero"
            onClick={() => setCreating(true)}
            disabled={!shopId || atOrOverLimit}
            title={atOrOverLimit && Number.isFinite(planLimit)
              ? t(planLimit === 1 ? "staff.limitTooltip" : "staff.limitTooltipPlural", { limit: planLimit })
              : undefined}
          >
            <Plus className="h-4 w-4" /> {t("staff.addStaff")}
          </Button>
        }
      />
      {atOrOverLimit && staffAccess.data && (
        <div className="mb-4">
          <FeatureLock access={staffAccess.data} featureLabel={t("feature.staff")} mode="inline" />
        </div>
      )}
      {atOrOverLimit && !staffAccess.data && (
        <div className="mb-4">
          <UpgradeNudge variant="staff-limit" count={planLimit as number} plan={activeShop?.plan === "pro" ? "Premium" : "Pro"} />
        </div>
      )}
      {!shopId ? <NoShopState /> : isLoading ? <LoadingGrid count={4} /> : staff.length === 0 ? (
        <EmptyState icon={UserCog} title={t("staff.noStaff")} description={t("staff.noStaffDesc")} action={<Button variant="hero" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> {t("staff.addStaff")}</Button>} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {staff.map((m) => {
            const hrs = (m.working_hours as { hours?: string })?.hours ?? "Not set";
            const svcs = serviceNamesFor(m.id);
            return (
              <div key={m.id} className="rounded-2xl border border-border bg-card p-6 shadow-soft">
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-brand text-base font-semibold text-primary-foreground">{initials(m.full_name)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-base font-semibold">{m.full_name}</h3>
                      <button onClick={() => toggleActive.mutate(m)} className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase transition", m.is_active ? "bg-mint text-mint-foreground" : "bg-muted text-muted-foreground")}>{m.is_active ? t("staff.active") : t("staff.off")}</button>
                    </div>
                    {m.email && <p className="truncate text-sm text-muted-foreground">{m.email}</p>}
                    <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarRange className="h-3.5 w-3.5" /> {hrs}</p>
                  </div>
                </div>
                <div className="mt-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("staff.services", { count: svcs.length })}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {svcs.length === 0 ? <span className="text-xs text-muted-foreground">{t("staff.noServicesAssigned")}</span> : svcs.map((s) => <span key={s} className="rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">{s}</span>)}
                  </div>
                </div>
                <div className="mt-5 flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditing(m)}><Pencil className="mr-1 h-3.5 w-3.5" /> {t("staff.edit")}</Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleting(m)}><Trash2 className="mr-1 h-3.5 w-3.5" /> {t("staff.remove")}</Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <StaffFormDialog open={creating || !!editing} onClose={() => { setCreating(false); setEditing(null); }} member={editing} shopId={shopId} services={services} links={links} />
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{t("staff.removeTitle", { name: deleting?.full_name ?? "" })}</AlertDialogTitle><AlertDialogDescription>{t("staff.removeDesc")}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>{t("staff.cancel")}</AlertDialogCancel><AlertDialogAction onClick={() => deleting && remove.mutate(deleting.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t("staff.remove")}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ShopLayout>
  );
}

type ServiceRow = { id: string; name: string; duration_minutes: number; price_cents: number; currency: string };
type LinkRow = { staff_id: string; service_id: string };

function StaffFormDialog({ open, onClose, member, shopId, services, links }: { open: boolean; onClose: () => void; member: StaffRow | null; shopId: string | null; services: ServiceRow[]; links: LinkRow[] }) {
  const qc = useQueryClient(); const { t } = useT();
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", hours: "", is_active: true });
  const [selectedServiceIds, setSelectedServiceIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!open) return;
    setForm({ full_name: member?.full_name ?? "", email: member?.email ?? "", phone: member?.phone ?? "", hours: (member?.working_hours as { hours?: string })?.hours ?? "", is_active: member?.is_active ?? true });
    setSelectedServiceIds(new Set(member ? links.filter((l) => l.staff_id === member.id).map((l) => l.service_id) : []));
  }, [open, member?.id, links]);

  const toggleService = (id: string) => setSelectedServiceIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  const save = useMutation({
    mutationFn: async () => {
      if (!shopId) throw new Error(t("errors.noActiveShop"));
      const payload = { shop_id: shopId, full_name: form.full_name.trim(), email: form.email.trim() || null, phone: form.phone.trim() || null, is_active: form.is_active, working_hours: form.hours.trim() ? { hours: form.hours.trim() } : {} };
      let staffId = member?.id;
      if (member) {
        const { error } = await supabase.from("staff").update(payload).eq("id", member.id); if (error) throw error;
      } else {
        const { data, error } = await supabase.from("staff").insert(payload).select("id").single(); if (error) throw error; staffId = data.id;
      }
      if (!staffId) throw new Error(t("errors.missingStaffId"));
      const desired = selectedServiceIds;
      const current = new Set(links.filter((l) => l.staff_id === staffId).map((l) => l.service_id));
      const toAdd = [...desired].filter((id) => !current.has(id));
      const toRemove = [...current].filter((id) => !desired.has(id));
      if (toAdd.length) { const { error } = await supabase.from("staff_services").insert(toAdd.map((service_id) => ({ staff_id: staffId!, service_id }))); if (error) throw error; }
      if (toRemove.length) { const { error } = await supabase.from("staff_services").delete().eq("staff_id", staffId).in("service_id", toRemove); if (error) throw error; }
    },
    onSuccess: () => {
      toast.success(member ? t("staff.updated") : t("staff.added"));
      onClose();
      if (shopId) qc.invalidateQueries({ queryKey: shopKeys.staff(shopId) });
      qc.invalidateQueries({ queryKey: ["staff_services", shopId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{member ? t("staff.editStaff") : t("staff.addStaffTitle")}</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-2">
          <div><Label htmlFor="fn">{t("staff.fullName")}</Label><Input id="fn" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
          <div><Label htmlFor="em">{t("staff.email")}</Label><Input id="em" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><Label htmlFor="ph">{t("staff.phone")}</Label><Input id="ph" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><Label htmlFor="hr">{t("staff.workingHours")}</Label><Input id="hr" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} placeholder={t("staff.workingHoursPlaceholder")} /></div>
          <div>
            <div className="flex items-center justify-between">
              <Label>{t("staff.assignServices")}</Label>
              <span className="text-xs text-muted-foreground">{t("staff.selectedCount", { count: selectedServiceIds.size })}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t("staff.assignServicesHint")}</p>
            <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-border p-2">
              {services.length === 0 ? (
                <p className="px-2 py-3 text-xs text-muted-foreground">{t("staff.noServicesYet")}</p>
              ) : (
                <ul className="grid gap-1">
                  {services.map((s) => {
                    const checked = selectedServiceIds.has(s.id);
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => toggleService(s.id)}
                          className={cn(
                            "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition",
                            checked ? "bg-primary/10 text-foreground" : "hover:bg-muted",
                          )}
                          aria-pressed={checked}
                        >
                          <span className="flex min-w-0 flex-1 items-center gap-2">
                            <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", checked ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background")}>
                              {checked && <Check className="h-3 w-3" />}
                            </span>
                            <span className="truncate">{s.name}</span>
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">{s.duration_minutes}m</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border p-3"><div><p className="text-sm font-medium">{t("staff.activeLabel")}</p><p className="text-xs text-muted-foreground">{t("staff.availableForBookings")}</p></div><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("staff.cancel")}</Button>
          <Button variant="hero" onClick={() => save.mutate()} disabled={!form.full_name.trim() || save.isPending}>{save.isPending ? t("staff.saving") : member ? t("staff.saveChanges") : t("staff.addStaff")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
