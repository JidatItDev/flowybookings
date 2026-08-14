import { useEffect, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, CalendarRange, Pencil, Trash2, UserCog, Check, Palette, RotateCcw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/shared/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MobileFormDialog } from "@/shop/shared/mobile/MobileFormDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EmptyState, LoadingGrid, NoShopState } from "@/shared/components/EmptyState";
import { UpgradeNudge } from "@/shop/shared/UpgradeNudge";
import { FeatureLock } from "@/shop/shared/FeatureLock";
import { useImpersonationReadOnly, assertNotImpersonating } from "@/admin/impersonation/ImpersonationBanner";
import { useActiveShopId, useShopContext } from "@/shop/shared/shop-context";
import { staffQuery, servicesQuery, bookingsQuery, shopKeys, staffServicesQuery } from "@/shop/shared/queries-barrel";
import type { StaffWorkingHours, StaffDayHours } from "@/shop/calendar/components/DayTimeGrid";
import { supabase } from "@/integrations/supabase/client";
import { initials } from "@/shared/lib/format";
import {
  staffColor,
  PALETTE_LIST,
  shopBrandingKeys,
  useStaffColors,
  type PaletteKey,
} from "@/shop/calendar/staff-color";
import { cn } from "@/shared/lib/utils";
import { useT } from "@/shared/lib/i18n";
import { useFeatureAccess, featureAccessKeys } from "@/shop/billing/use-feature-access";
import { logActivity } from "@/shared/lib/activity-log";
import { entityInUseFromBookings, entityHasOpenFutureBookings, isEntityInUseError, isStaffPlanLimitError } from "@/shop/shared/entity-in-use";

// ─── Working-hours helpers (gedeelde shape met DayTimeGrid) ───────────────────

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type DayKey = (typeof DAY_KEYS)[number];
const WEEKDAY_KEYS: DayKey[] = ["mon", "tue", "wed", "thu", "fri"];
const DAY_LABELS: Record<DayKey, string> = {
  mon: "Ma", tue: "Di", wed: "Wo", thu: "Do", fri: "Vr", sat: "Za", sun: "Zo",
};

/** Lees alleen geldige per-dag entries uit working_hours (negeer 'hours' free-text). */
function extractScheduleFromWorkingHours(wh: StaffWorkingHours): Partial<Record<DayKey, StaffDayHours>> {
  const out: Partial<Record<DayKey, StaffDayHours>> = {};
  for (const k of DAY_KEYS) {
    const dh = wh[k];
    if (dh && typeof dh === "object") out[k] = dh;
  }
  return out;
}

/** Verwijder dagen met geen zinnige data en filter lege pauzes. */
function cleanSchedule(schedule: Partial<Record<DayKey, StaffDayHours>>): Partial<Record<DayKey, StaffDayHours>> {
  const out: Partial<Record<DayKey, StaffDayHours>> = {};
  for (const k of DAY_KEYS) {
    const dh = schedule[k];
    if (!dh) continue;
    if (dh.closed) { out[k] = { closed: true }; continue; }
    if (dh.open && dh.close) {
      const breaks = (dh.breaks ?? []).filter((b) => b.start && b.end);
      out[k] = breaks.length ? { open: dh.open, close: dh.close, closed: false, breaks } : { open: dh.open, close: dh.close, closed: false };
    }
  }
  return out;
}

/** Korte samenvatting voor de overzichtskaart, bv "Ma–Vr 09:00–18:00 · Za 10:00–14:00". */
function summariseSchedule(wh: StaffWorkingHours): string | null {
  const sched = extractScheduleFromWorkingHours(wh);
  const entries = DAY_KEYS.map((k) => ({ k, dh: sched[k] })).filter((e) => e.dh) as { k: DayKey; dh: StaffDayHours }[];
  if (entries.length === 0) return null;
  const parts: string[] = [];
  let i = 0;
  while (i < entries.length) {
    const start = entries[i];
    if (start.dh.closed) { parts.push(`${DAY_LABELS[start.k]} gesloten`); i += 1; continue; }
    const sig = `${start.dh.open}-${start.dh.close}`;
    let j = i;
    while (
      j + 1 < entries.length &&
      DAY_KEYS.indexOf(entries[j + 1].k) === DAY_KEYS.indexOf(entries[j].k) + 1 &&
      !entries[j + 1].dh.closed &&
      `${entries[j + 1].dh.open}-${entries[j + 1].dh.close}` === sig
    ) j += 1;
    parts.push(j > i
      ? `${DAY_LABELS[start.k]}–${DAY_LABELS[entries[j].k]} ${start.dh.open}–${start.dh.close}`
      : `${DAY_LABELS[start.k]} ${start.dh.open}–${start.dh.close}`);
    i = j + 1;
  }
  return parts.join(" · ");
}

const DEFAULT_WEEK_PRESET: Partial<Record<DayKey, StaffDayHours>> = {
  mon: { open: "09:00", close: "17:00", closed: false },
  tue: { open: "09:00", close: "17:00", closed: false },
  wed: { open: "09:00", close: "17:00", closed: false },
  thu: { open: "09:00", close: "17:00", closed: false },
  fri: { open: "09:00", close: "17:00", closed: false },
  sat: { closed: true },
  sun: { closed: true },
};

function WeeklyHoursEditor({
  schedule,
  onChange,
}: {
  schedule: Partial<Record<DayKey, StaffDayHours>>;
  onChange: (s: Partial<Record<DayKey, StaffDayHours>>) => void;
}) {
  const update = (k: DayKey, patch: Partial<StaffDayHours> | null) => {
    const next = { ...schedule };
    if (patch === null) delete next[k]; else next[k] = { ...next[k], ...patch };
    onChange(next);
  };
  const updateBreak = (k: DayKey, idx: number, patch: { start?: string; end?: string }) => {
    const dh = schedule[k];
    if (!dh) return;
    const breaks = [...(dh.breaks ?? [])];
    breaks[idx] = { ...breaks[idx], ...patch };
    update(k, { breaks });
  };
  const addBreak = (k: DayKey) => {
    const dh = schedule[k];
    const breaks = [...(dh?.breaks ?? []), { start: "12:00", end: "13:00" }];
    update(k, { breaks });
  };
  const removeBreak = (k: DayKey, idx: number) => {
    const dh = schedule[k];
    if (!dh) return;
    const breaks = (dh.breaks ?? []).filter((_, i) => i !== idx);
    update(k, { breaks });
  };
  const copyToWeekdays = (source: DayKey) => {
    const src = schedule[source];
    if (!src || src.closed || !src.open || !src.close) {
      toast.error("Stel eerst werktijden in voor deze dag");
      return;
    }
    const next = { ...schedule };
    for (const k of WEEKDAY_KEYS) {
      next[k] = {
        open: src.open,
        close: src.close,
        closed: false,
        breaks: src.breaks ? src.breaks.map((b) => ({ ...b })) : undefined,
      };
    }
    onChange(next);
    toast.success("Gekopieerd naar alle werkdagen (ma–vr)");
  };
  const applyDefaultPreset = () => {
    onChange({ ...DEFAULT_WEEK_PRESET });
    toast.success("Standaard week toegepast (ma–vr 09:00–17:00)");
  };
  const clearAll = () => {
    onChange({});
  };
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm">Weekrooster</Label>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={applyDefaultPreset} className="rounded-md border border-border bg-background px-2 py-1 text-[11px] text-foreground hover:bg-muted">Standaard week</button>
          <button type="button" onClick={clearAll} className="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground">Leegmaken</button>
        </div>
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">Werktijden + optionele pauzes per dag. Wordt gebruikt door de dag-kalender.</p>
      <div className="mt-3 grid gap-2">
        {DAY_KEYS.map((k) => {
          const dh = schedule[k];
          const enabled = !!dh && !dh.closed;
          const closed = !!dh?.closed;
          const breaks = dh?.breaks ?? [];
          const isWeekday = WEEKDAY_KEYS.includes(k);
          return (
            <div key={k} className="rounded-lg border border-border/60 bg-background/40 p-2">
              <div className="flex items-center gap-2 text-xs">
                <span className="w-8 shrink-0 font-semibold uppercase text-muted-foreground">{DAY_LABELS[k]}</span>
                <Switch
                  checked={enabled}
                  onCheckedChange={(v) => update(k, v ? { open: dh?.open ?? "09:00", close: dh?.close ?? "17:00", closed: false } : (dh ? { closed: true, open: undefined, close: undefined, breaks: undefined } : null))}
                />
                {closed ? (
                  <span className="text-muted-foreground">Vrij</span>
                ) : enabled ? (
                  <div className="flex flex-1 flex-wrap items-center gap-1.5">
                    <Input type="time" className="h-7 w-[88px]" value={dh?.open ?? ""} onChange={(e) => update(k, { open: e.target.value })} />
                    <span className="text-muted-foreground">–</span>
                    <Input type="time" className="h-7 w-[88px]" value={dh?.close ?? ""} onChange={(e) => update(k, { close: e.target.value })} />
                    {isWeekday && (
                      <button type="button" onClick={() => copyToWeekdays(k)} className="ml-auto rounded-md border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground" title="Kopieer deze tijden naar ma–vr">
                        Kopieer naar ma–vr
                      </button>
                    )}
                  </div>
                ) : (
                  <span className="text-muted-foreground">Niet ingesteld</span>
                )}
              </div>
              {enabled && !closed && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-10">
                  {breaks.map((b, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-1.5 py-0.5">
                      <span className="text-[10px] text-muted-foreground">Pauze</span>
                      <Input type="time" className="h-6 w-[80px]" value={b.start ?? ""} onChange={(e) => updateBreak(k, idx, { start: e.target.value })} />
                      <span className="text-muted-foreground">–</span>
                      <Input type="time" className="h-6 w-[80px]" value={b.end ?? ""} onChange={(e) => updateBreak(k, idx, { end: e.target.value })} />
                      <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => removeBreak(k, idx)} aria-label="Pauze verwijderen">×</button>
                    </span>
                  ))}
                  <button type="button" className="text-[11px] text-primary hover:underline" onClick={() => addBreak(k)}>+ Pauze</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

type StaffRow = { id: string; full_name: string; email: string | null; phone: string | null; is_active: boolean; working_hours: unknown };

export function StaffPage() {
  const shopId = useActiveShopId(); const qc = useQueryClient(); const { t } = useT();
  const readOnly = useImpersonationReadOnly();
  const roTitle = readOnly ? t("impersonate.readOnlyTooltip") : undefined;
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
  const { data: links = [] } = useQuery({ ...staffServicesQuery(shopId ?? ""), enabled: !!shopId });
  const { data: bookings = [] } = useQuery({ ...bookingsQuery(shopId ?? ""), enabled: !!shopId });
  const colors = useStaffColors(shopId);
  const atOrOverLimit = staffAccess.data ? !staffAccess.data.allowed : (Number.isFinite(planLimit) && staff.length >= planLimit);

  const toggleActive = useMutation({
    mutationFn: async (s: StaffRow) => { assertNotImpersonating(); const { error } = await supabase.from("staff").update({ is_active: !s.is_active }).eq("id", s.id); if (error) throw error; },
    onSuccess: () => {
      if (shopId) {
        qc.invalidateQueries({ queryKey: shopKeys.staff(shopId) });
        qc.invalidateQueries({ queryKey: featureAccessKeys.one(shopId, "max_staff") });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      assertNotImpersonating();
      if (await entityHasOpenFutureBookings("staff", id)) {
        throw new Error("ENTITY_IN_USE: cannot delete staff with upcoming bookings");
      }
      const { error } = await supabase.from("staff").delete().eq("id", id); if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("staff.removed"));
      setDeleting(null);
      if (shopId) {
        qc.invalidateQueries({ queryKey: shopKeys.staff(shopId) });
        qc.invalidateQueries({ queryKey: featureAccessKeys.one(shopId, "max_staff") });
      }
    },
    onError: (e: Error) => toast.error(isEntityInUseError(e) ? t("staff.deleteBlocked", { name: deleting?.full_name ?? "" }) : e.message),
  });
  const deletingInUse = deleting ? entityInUseFromBookings(bookings, "staff", deleting.id) : false;
  const serviceNamesFor = (staffId: string) => { const ids = new Set(links.filter((l) => l.staff_id === staffId).map((l) => l.service_id)); return services.filter((s) => ids.has(s.id)).map((s) => s.name); };

  return (
    <>
      <PageHeader
        title={t("staff.title")}
        description={t("staff.description")}
        actions={
          <Button
            variant="hero"
            onClick={() => setCreating(true)}
            disabled={!shopId || atOrOverLimit || readOnly}
            title={readOnly
              ? t("impersonate.readOnlyTooltip")
              : atOrOverLimit && Number.isFinite(planLimit)
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
        <EmptyState icon={UserCog} title={t("staff.noStaff")} description={t("staff.noStaffDesc")} action={<Button variant="hero" onClick={() => setCreating(true)} disabled={readOnly || atOrOverLimit} title={readOnly ? roTitle : atOrOverLimit && Number.isFinite(planLimit) ? t(planLimit === 1 ? "staff.limitTooltip" : "staff.limitTooltipPlural", { limit: planLimit }) : undefined}><Plus className="h-4 w-4" /> {t("staff.addStaff")}</Button>} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {staff.map((m) => {
            const wh = (m.working_hours ?? {}) as StaffWorkingHours;
            const summary = summariseSchedule(wh);
            const hrsLine = summary ?? wh.hours ?? t("staff.notSet");
            const svcs = serviceNamesFor(m.id);
            const c = colors.get(m.id);
            const overrideKey = colors.overrideOf(m.id);
            return (
              <div key={m.id} className="rounded-2xl border border-border bg-card p-6 shadow-soft">
                <div className="flex items-start gap-4">
                  <div
                    className={cn(
                      "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-base font-semibold ring-2 ring-inset ring-current/10",
                      c.bg,
                      c.text,
                    )}
                    title={m.full_name}
                  >
                    {initials(m.full_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-base font-semibold">{m.full_name}</h3>
                      <button onClick={() => toggleActive.mutate(m)} disabled={readOnly} title={roTitle} className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase transition disabled:cursor-not-allowed disabled:opacity-60", m.is_active ? "bg-mint text-mint-foreground" : "bg-muted text-muted-foreground")}>{m.is_active ? t("staff.active") : t("staff.off")}</button>
                    </div>
                    {m.email && <p className="truncate text-sm text-muted-foreground">{m.email}</p>}
                    <p className="mt-2 inline-flex items-start gap-1.5 text-xs text-muted-foreground"><CalendarRange className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span className="break-words">{hrsLine}</span></p>
                  </div>
                  <StaffColorPicker
                    staffId={m.id}
                    shopId={shopId}
                    currentKey={overrideKey}
                    disabled={readOnly}
                    readOnlyTitle={roTitle}
                    usageByOthers={(() => {
                      const map: Partial<Record<PaletteKey, string[]>> = {};
                      for (const other of staff) {
                        if (other.id === m.id || !other.is_active) continue;
                        const k = colors.get(other.id).key;
                        (map[k] ||= []).push(other.full_name);
                      }
                      return map;
                    })()}
                  />
                </div>
                <div className="mt-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("staff.services", { count: svcs.length })}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {svcs.length === 0 ? <span className="text-xs text-muted-foreground">{t("staff.noServicesAssigned")}</span> : svcs.map((s) => <span key={s} className="rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">{s}</span>)}
                  </div>
                </div>
                <div className="mt-5 flex gap-2">
                  <Button variant="outline" size="sm" disabled={readOnly} title={roTitle} onClick={() => setEditing(m)}><Pencil className="mr-1 h-3.5 w-3.5" /> {t("staff.edit")}</Button>
                  <Button variant="ghost" size="sm" disabled={readOnly} title={roTitle} onClick={() => setDeleting(m)}><Trash2 className="mr-1 h-3.5 w-3.5" /> {t("staff.remove")}</Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <StaffFormDialog open={creating || !!editing} onClose={() => { setCreating(false); setEditing(null); }} member={editing} shopId={shopId} services={services} links={links} />
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("staff.removeTitle", { name: deleting?.full_name ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingInUse
                ? t(deleting?.is_active ? "staff.deleteBlocked" : "staff.deleteBlockedInactive", { name: deleting?.full_name ?? "" })
                : t("staff.removeDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("staff.cancel")}</AlertDialogCancel>
            {deletingInUse ? (
              deleting?.is_active ? (
                <AlertDialogAction
                  onClick={() => {
                    if (!deleting) return;
                    toggleActive.mutate(deleting);
                    setDeleting(null);
                  }}
                >
                  {t("staff.deactivateInstead")}
                </AlertDialogAction>
              ) : null
            ) : (
              <AlertDialogAction onClick={() => deleting && remove.mutate(deleting.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t("staff.remove")}</AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

type ServiceRow = { id: string; name: string; duration_minutes: number; price_cents: number; currency: string };
type LinkRow = { staff_id: string; service_id: string };

function StaffFormDialog({ open, onClose, member, shopId, services, links }: { open: boolean; onClose: () => void; member: StaffRow | null; shopId: string | null; services: ServiceRow[]; links: LinkRow[] }) {
  const qc = useQueryClient(); const { t } = useT();
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", hours: "", is_active: true });
  const [schedule, setSchedule] = useState<Partial<Record<DayKey, StaffDayHours>>>({});
  const [selectedServiceIds, setSelectedServiceIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!open) return;
    const wh = (member?.working_hours ?? {}) as StaffWorkingHours;
    setForm({ full_name: member?.full_name ?? "", email: member?.email ?? "", phone: member?.phone ?? "", hours: wh.hours ?? "", is_active: member?.is_active ?? true });
    setSchedule(extractScheduleFromWorkingHours(wh));
    setSelectedServiceIds(new Set(member ? links.filter((l) => l.staff_id === member.id).map((l) => l.service_id) : []));
  }, [open, member?.id, links]);

  const toggleService = (id: string) => setSelectedServiceIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  const save = useMutation({
    mutationFn: async () => {
      assertNotImpersonating();
      if (!shopId) throw new Error(t("errors.noActiveShop"));
      // Combineer gestructureerd schema (per-dag + breaks) met optionele vrije-tekst fallback.
      const cleaned = cleanSchedule(schedule);
      const wh: StaffWorkingHours = { ...cleaned };
      if (form.hours.trim()) wh.hours = form.hours.trim();
      const payload = { shop_id: shopId, full_name: form.full_name.trim(), email: form.email.trim() || null, phone: form.phone.trim() || null, is_active: form.is_active, working_hours: wh as never };
      let staffId = member?.id;
      if (member) {
        const { error } = await supabase.from("staff").update(payload).eq("id", member.id); if (error) throw error;
      } else {
        const { data, error } = await supabase.from("staff").insert(payload).select("id").single(); if (error) throw error; staffId = data.id;
        // Admin onboarding-funnel: log staff_invited bij nieuwe staff.
        void logActivity({
          entity: "staff",
          action: "staff_invited",
          shopId,
          metadata: { staff_id: data.id, full_name: payload.full_name, email: payload.email },
        });
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
      if (shopId) {
        qc.invalidateQueries({ queryKey: shopKeys.staff(shopId) });
        qc.invalidateQueries({ queryKey: shopKeys.staffServices(shopId) });
        qc.invalidateQueries({ queryKey: featureAccessKeys.one(shopId, "max_staff") });
      }
    },
    onError: (e: Error) => {
      if (isStaffPlanLimitError(e)) {
        const m = e.message.match(/max_staff \((\d+)\)/i);
        const limit = m ? Number(m[1]) : 0;
        toast.error(t(limit === 1 ? "staff.limitTooltip" : "staff.limitTooltipPlural", { limit: limit || "" }));
        return;
      }
      toast.error(e.message);
    },
  });

  return (
    <MobileFormDialog
      open={open}
      onClose={onClose}
      title={member ? t("staff.editStaff") : t("staff.addStaffTitle")}
      footer={
        <>
          <Button variant="outline" onClick={onClose} className="h-11 w-full sm:h-9 sm:w-auto">{t("staff.cancel")}</Button>
          <Button variant="hero" onClick={() => save.mutate()} disabled={!form.full_name.trim() || save.isPending} className="h-11 w-full sm:h-9 sm:w-auto">
            {save.isPending ? t("staff.saving") : member ? t("staff.saveChanges") : t("staff.addStaff")}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div><Label htmlFor="fn">{t("staff.fullName")}</Label><Input id="fn" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="h-11 text-base sm:h-9 sm:text-sm" /></div>
        <div><Label htmlFor="em">{t("staff.email")}</Label><Input id="em" type="email" inputMode="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-11 text-base sm:h-9 sm:text-sm" /></div>
        <div><Label htmlFor="ph">{t("staff.phone")}</Label><Input id="ph" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-11 text-base sm:h-9 sm:text-sm" /></div>
        <WeeklyHoursEditor schedule={schedule} onChange={setSchedule} />
        <div>
          <Label htmlFor="hr" className="text-xs text-muted-foreground">Vrije-tekst notitie (optioneel)</Label>
          <Input id="hr" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} placeholder={t("staff.workingHoursPlaceholder")} className="h-11 text-base sm:h-9 sm:text-sm" />
          <p className="mt-1 text-[11px] text-muted-foreground">Wordt alleen op de overzichtskaart getoond als er geen weekrooster is ingesteld.</p>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label>{t("staff.assignServices")}</Label>
            <span className="text-xs text-muted-foreground">{t("staff.selectedCount", { count: selectedServiceIds.size })}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t("staff.assignServicesHint")}</p>
          <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-border p-2">
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
                          "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left text-sm transition sm:py-2",
                          checked ? "bg-primary/10 text-foreground" : "hover:bg-muted",
                        )}
                        aria-pressed={checked}
                      >
                        <span className="flex min-w-0 flex-1 items-center gap-2">
                          <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded border sm:h-4 sm:w-4", checked ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background")}>
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
    </MobileFormDialog>
  );
}

function StaffColorPicker({
  staffId,
  shopId,
  currentKey,
  disabled,
  readOnlyTitle,
  usageByOthers,
}: {
  staffId: string;
  shopId: string | null;
  currentKey: PaletteKey | null;
  disabled?: boolean;
  readOnlyTitle?: string;
  usageByOthers?: Partial<Record<PaletteKey, string[]>>;
}) {
  const qc = useQueryClient();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const autoColor = staffColor(staffId);
  const activeKey = currentKey ?? autoColor.key;
  const usage = usageByOthers ?? {};
  const conflictNames = usage[activeKey] ?? [];

  const save = useMutation({
    mutationFn: async (nextKey: PaletteKey | null) => {
      assertNotImpersonating();
      if (!shopId) throw new Error(t("errors.noActiveShop"));
      // Read current branding then merge to avoid clobbering other keys.
      const { data, error } = await supabase
        .from("shops")
        .select("branding")
        .eq("id", shopId)
        .maybeSingle<{ branding: Record<string, unknown> | null }>();
      if (error) throw error;
      const branding = (data?.branding ?? {}) as Record<string, unknown>;
      const staffColors = { ...((branding.staff_colors as Record<string, PaletteKey>) ?? {}) };
      if (nextKey) staffColors[staffId] = nextKey;
      else delete staffColors[staffId];
      const nextBranding = { ...branding, staff_colors: staffColors };
      const { error: upErr } = await supabase
        .from("shops")
        .update({ branding: nextBranding })
        .eq("id", shopId);
      if (upErr) throw upErr;
    },
    onSuccess: (_d, nextKey) => {
      toast.success(nextKey ? "Kleur bijgewerkt" : "Kleur teruggezet op standaard");
      if (shopId) qc.invalidateQueries({ queryKey: shopBrandingKeys.branding(shopId) });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Popover open={open} onOpenChange={(o) => !disabled && setOpen(o)}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled || save.isPending}
          title={readOnlyTitle ?? "Kleur aanpassen"}
          aria-label="Kleur aanpassen"
          className={cn(
            "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          <Palette className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kleur</p>
          {currentKey && (
            <button
              type="button"
              onClick={() => save.mutate(null)}
              disabled={save.isPending}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3 w-3" /> Standaard
            </button>
          )}
        </div>
        {conflictNames.length > 0 && (
          <div className="mb-2 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Deze kleur is al in gebruik door{" "}
              <span className="font-semibold">{conflictNames.join(", ")}</span>. Kies een andere kleur voor betere herkenning.
            </span>
          </div>
        )}
        <div className="grid grid-cols-5 gap-2">
          {PALETTE_LIST.map((p) => {
            const selected = p.key === activeKey;
            const usedBy = usage[p.key] ?? [];
            const isConflict = usedBy.length > 0;
            return (
              <button
                key={p.key}
                type="button"
                disabled={save.isPending}
                onClick={() => save.mutate(p.key)}
                title={isConflict ? `${p.label} — al in gebruik door ${usedBy.join(", ")}` : p.label}
                aria-label={p.label}
                aria-pressed={selected}
                className={cn(
                  "relative flex h-8 w-8 items-center justify-center rounded-full transition",
                  p.swatch,
                  selected ? "ring-2 ring-offset-2 ring-offset-background ring-foreground" : "hover:scale-110",
                )}
              >
                {selected && <Check className="h-4 w-4 text-white drop-shadow" />}
                {isConflict && !selected && (
                  <span
                    className="absolute -right-0.5 -top-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-amber-500 text-[8px] font-bold text-white ring-1 ring-background"
                    aria-hidden
                  >
                    !
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {!currentKey && conflictNames.length === 0 && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            Auto-kleur (op basis van medewerker-id). Kies een kleur om te overrulen.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
