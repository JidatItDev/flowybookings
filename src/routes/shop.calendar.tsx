import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, Filter, CalendarDays, UserX, Check, ChevronsUpDown, UserPlus, Search, List, LayoutGrid } from "lucide-react";
import { DayTimeGrid } from "@/components/calendar/DayTimeGrid";
import { toast } from "sonner";
import { ShopLayout } from "@/components/ShopLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState, NoShopState } from "@/components/EmptyState";
import { FeatureLock } from "@/components/FeatureLock";
import { useImpersonationReadOnly, assertNotImpersonating } from "@/components/ImpersonationBanner";
import { useActiveShopId } from "@/lib/shop-context";
import {
  bookingsQuery, customersQuery, servicesQuery, shopFullQuery, shopKeys, staffQuery,
  type BookingWithRelations,
} from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { formatCents, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { getTrialState } from "@/lib/trial";
import { useFeatureAccess, usagePercentage } from "@/lib/use-feature-access";
import { staffColor, staffInitials, useStaffColors } from "@/lib/staff-color";

export const Route = createFileRoute("/shop/calendar")({
  head: () => ({ meta: [{ title: "Calendar — FlowyBookings" }] }),
  component: CalendarPage,
});

const statuses = ["all", "pending", "confirmed", "completed", "cancelled", "no_show"] as const;

function CalendarPage() {
  const shopId = useActiveShopId();
  const { activeShop } = useAuth();
  const trial = getTrialState(activeShop as never);
  const readOnly = useImpersonationReadOnly();
  const bookingsAccess = useFeatureAccess(shopId, "max_bookings_per_month");
  const bookingsBlocked = !!bookingsAccess.data && !bookingsAccess.data.allowed;
  const bookingsPct = usagePercentage(bookingsAccess.data);
  const bookingsWarn =
    !!bookingsAccess.data && bookingsAccess.data.limit != null && bookingsPct >= 80 && bookingsPct < 100;
  // Block when trial expired OR payment failed grace expired OR feature limit hit OR impersonate.
  const subscriptionBlocked = trial.isExpired || trial.paymentFailedGraceExpired;
  const newBookingDisabled = !shopId || subscriptionBlocked || bookingsBlocked || readOnly;
  const qc = useQueryClient();
  const { t } = useT();
  const newBookingTitle = readOnly
    ? t("impersonate.readOnlyTooltip")
    : trial.paymentFailedGraceExpired
      ? t("billing.paymentFailedBlockedTitle")
      : trial.isExpired
        ? t("calendar.trialExpiredBookingTitle")
        : bookingsBlocked
          ? t("calendar.bookingLimitReached", {
              used: bookingsAccess.data?.used ?? 0,
              limit: bookingsAccess.data?.limit ?? 0,
            })
          : undefined;
  const [filter, setFilter] = useState<(typeof statuses)[number]>("all");
  const [staffFilter, setStaffFilter] = useState<string | "all" | "unassigned">("all");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<BookingWithRelations | null>(null);
  const [deleting, setDeleting] = useState<BookingWithRelations | null>(null);
  const [viewing, setViewing] = useState<BookingWithRelations | null>(null);
  const [dayOffset, setDayOffset] = useState<number | null>(0); // 0 = vandaag, null = alle
  const [viewMode, setViewMode] = useState<"list" | "grid">("grid");
  const [slotPrefill, setSlotPrefill] = useState<{ staffId: string | null; startsAt: Date } | null>(null);

  const statusLabel: Record<string, string> = {
    all: t("calendar.filterAll"), pending: t("calendar.pending"), confirmed: t("calendar.confirmed"),
    completed: t("calendar.completed"), cancelled: t("calendar.cancelled"), no_show: t("calendar.noShow"),
  };

  const { data: bookings = [] } = useQuery({ ...bookingsQuery(shopId ?? ""), enabled: !!shopId });
  const { data: customers = [] } = useQuery({ ...customersQuery(shopId ?? ""), enabled: !!shopId });
  const { data: services = [] } = useQuery({ ...servicesQuery(shopId ?? ""), enabled: !!shopId });
  const { data: staff = [] } = useQuery({ ...staffQuery(shopId ?? ""), enabled: !!shopId });
  const { data: shopFull } = useQuery({ ...shopFullQuery(shopId ?? ""), enabled: !!shopId });
  const businessHours = (shopFull?.business_hours ?? undefined) as
    | import("@/components/calendar/DayTimeGrid").BusinessHours
    | undefined;
  const colors = useStaffColors(shopId);

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: BookingWithRelations["status"] }) => {
      assertNotImpersonating();
      const { error } = await supabase.from("bookings").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("calendar.bookingUpdated"));
      if (shopId) qc.invalidateQueries({ queryKey: shopKeys.bookings(shopId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      assertNotImpersonating();
      const { error } = await supabase.from("bookings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("calendar.bookingDeleted"));
      setDeleting(null);
      if (shopId) qc.invalidateQueries({ queryKey: shopKeys.bookings(shopId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Bookings filtered by status + day (without staff filter) — used for staff chip counts
  const scopedBookings = bookings.filter((b) => {
    if (filter !== "all" && b.status !== filter) return false;
    if (dayOffset !== null) {
      const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0); dayStart.setUTCDate(dayStart.getUTCDate() + dayOffset);
      const dayEnd = new Date(dayStart); dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
      const t = new Date(b.starts_at).getTime();
      if (t < dayStart.getTime() || t >= dayEnd.getTime()) return false;
    }
    return true;
  });

  const staffCounts = useMemo(() => {
    const map = new Map<string, number>();
    let unassigned = 0;
    for (const b of scopedBookings) {
      if (b.staff_id) map.set(b.staff_id, (map.get(b.staff_id) ?? 0) + 1);
      else unassigned += 1;
    }
    return { map, unassigned, total: scopedBookings.length };
  }, [scopedBookings]);

  const filtered = scopedBookings.filter((b) => {
    if (staffFilter === "unassigned") return !b.staff_id;
    if (staffFilter !== "all" && b.staff_id !== staffFilter) return false;
    return true;
  });

  // Genereer 14 dagen vooruit voor de dag-selector
  const dayChips = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() + i);
    const count = bookings.filter((b) => {
      const t = new Date(b.starts_at).getTime();
      const next = new Date(d); next.setUTCDate(next.getUTCDate() + 1);
      return t >= d.getTime() && t < next.getTime();
    }).length;
    return { offset: i, date: d, count };
  });

  return (
    <ShopLayout>
      <PageHeader
        title={t("calendar.title")}
        description={t("calendar.description")}
        actions={
          <Button
            variant="hero"
            onClick={() => setCreating(true)}
            disabled={newBookingDisabled}
            title={newBookingTitle}
          >
            <Plus className="h-4 w-4" /> {t("calendar.newBooking")}
          </Button>
        }
      />

      {bookingsAccess.data && (bookingsWarn || bookingsBlocked) && (
        <div className="mb-4">
          <FeatureLock access={bookingsAccess.data} featureLabel={t("feature.bookings")} mode="inline" />
        </div>
      )}

      {!shopId ? (
        <NoShopState />
      ) : (
        <>
          {/* Sticky kleurensleutel: toont alle actieve medewerkers met hun kleur */}
          {staff.filter((s) => s.is_active).length > 0 && (
            <div className="sticky top-0 z-20 -mx-4 mb-3 border-b border-border/60 bg-background/85 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:mx-0 sm:rounded-lg sm:border sm:px-3">
              <div className="flex items-center gap-2 overflow-x-auto">
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("calendar.staffCol")}
                </span>
                {staff.filter((s) => s.is_active).map((s) => {
                  const c = colors.get(s.id);
                  const count = staffCounts.map.get(s.id) ?? 0;
                  const active = staffFilter === s.id;
                  return (
                    <button
                      key={`legend-${s.id}`}
                      type="button"
                      onClick={() => setStaffFilter((prev) => (prev === s.id ? "all" : s.id))}
                      className={cn(
                        "group inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors",
                        active ? `${c.bg} ${c.text}` : "text-muted-foreground hover:bg-muted",
                      )}
                      title={`${s.full_name} — ${count}`}
                    >
                      <span className={cn("h-2.5 w-2.5 rounded-full ring-1 ring-inset ring-foreground/10", c.swatch)} />
                      <span className="max-w-[110px] truncate">{s.full_name}</span>
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums",
                          active ? "bg-background/30 text-current" : "bg-muted-foreground/15 text-muted-foreground",
                        )}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Dag-selector: horizontaal scrollbaar */}
          <div className="mb-3 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <div className="flex items-center gap-2 pb-2">
              <button
                onClick={() => setDayOffset(null)}
                className={cn(
                  "shrink-0 rounded-xl border px-3 py-2 text-xs font-medium transition-colors",
                  dayOffset === null ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-muted",
                )}
              >
                {t("calendar.allUpcoming")}
              </button>
              {dayChips.map((c) => {
                const isToday = c.offset === 0;
                const active = dayOffset === c.offset;
                return (
                  <button
                    key={c.offset}
                    onClick={() => setDayOffset(c.offset)}
                    className={cn(
                      "shrink-0 rounded-xl border px-3 py-2 text-center transition-colors",
                      active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted",
                    )}
                  >
                    <div className="text-[10px] uppercase tracking-wider opacity-80">
                      {isToday ? t("calendar.today") : c.date.toLocaleDateString("nl-NL", { weekday: "short", timeZone: "UTC" })}
                    </div>
                    <div className="text-sm font-semibold">
                      {c.date.toLocaleDateString("nl-NL", { day: "2-digit", month: "short", timeZone: "UTC" })}
                    </div>
                    {c.count > 0 && (
                      <div className={cn("mt-0.5 text-[10px] font-medium", active ? "text-primary-foreground/90" : "text-primary")}>
                        {c.count} {c.count === 1 ? t("calendar.appointment") : t("calendar.appointments")}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            {statuses.map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium capitalize",
                  filter === s ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted",
                )}
              >
                {statusLabel[s]}
              </button>
            ))}
          </div>

          {staff.filter((s) => s.is_active).length > 0 && (
            <div className="mb-4 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <div className="flex items-center gap-2 pb-1">
                <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("calendar.staffCol")}</span>
                <button
                  onClick={() => setStaffFilter("all")}
                  className={cn(
                    "shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    staffFilter === "all" ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:bg-muted",
                  )}
                >
                  {t("calendar.filterAll")}
                  <span className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                    staffFilter === "all" ? "bg-background/20 text-background" : "bg-muted-foreground/15 text-muted-foreground",
                  )}>
                    {staffCounts.total}
                  </span>
                </button>
                {staff.filter((s) => s.is_active).map((s) => {
                  const c = colors.get(s.id);
                  const active = staffFilter === s.id;
                  const count = staffCounts.map.get(s.id) ?? 0;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setStaffFilter(s.id)}
                      className={cn(
                        "group inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all",
                        active
                          ? `${c.bg} ${c.text} border-transparent ring-2 ring-offset-1 ring-offset-background`
                          : "border-border bg-card text-muted-foreground hover:bg-muted",
                      )}
                      style={active ? { boxShadow: "0 0 0 1px currentColor inset" } : undefined}
                      title={`${s.full_name} — ${count}`}
                    >
                      <span className={cn(
                        "flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-semibold",
                        active ? c.dot : "bg-muted-foreground/20",
                      )}>
                        {staffInitials(s.full_name)}
                      </span>
                      <span className="max-w-[100px] truncate">{s.full_name}</span>
                      <span className={cn(
                        "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                        active ? "bg-background/25 text-current" : "bg-muted-foreground/15 text-muted-foreground",
                      )}>
                        {count}
                      </span>
                    </button>
                  );
                })}
                <button
                  onClick={() => setStaffFilter("unassigned")}
                  className={cn(
                    "shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium italic transition-colors",
                    staffFilter === "unassigned"
                      ? "border-dashed border-foreground bg-muted text-foreground"
                      : "border-dashed border-border bg-card text-muted-foreground hover:bg-muted",
                  )}
                >
                  Niet toegewezen
                  <span className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold not-italic tabular-nums",
                    staffFilter === "unassigned" ? "bg-foreground/15 text-foreground" : "bg-muted-foreground/15 text-muted-foreground",
                  )}>
                    {staffCounts.unassigned}
                  </span>
                </button>

              </div>
            </div>
          )}

          {/* View toggle: lijst of tijdgrid. Grid alleen zinvol als 1 dag is gekozen. */}
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              {filtered.length} {filtered.length === 1 ? t("calendar.appointment") : t("calendar.appointments")}
            </div>
            <div className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 p-1 text-xs">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                disabled={dayOffset === null}
                title={dayOffset === null ? "Kies een dag om het rooster te tonen" : "Rooster"}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-3 py-1 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  viewMode === "grid" && dayOffset !== null
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" /> Rooster
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-3 py-1 font-medium transition-colors",
                  viewMode === "list" || dayOffset === null
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <List className="h-3.5 w-3.5" /> Lijst
              </button>
            </div>
          </div>

          {filtered.length === 0 && viewMode === "list" ? (
            <EmptyState
              icon={CalendarDays}
              title={filter === "all" ? t("calendar.noBookings") : t("calendar.noMatch")}
              description={filter === "all" ? t("calendar.noBookingsDesc") : t("calendar.noMatchDesc")}
              action={filter === "all" && (
                <Button variant="hero" onClick={() => setCreating(true)} disabled={newBookingDisabled} title={newBookingTitle}>
                  <Plus className="h-4 w-4" /> {t("calendar.newBooking")}
                </Button>
              )}
            />
          ) : viewMode === "grid" && dayOffset !== null ? (
            <DayTimeGrid
              day={(() => {
                const d = new Date();
                d.setUTCHours(0, 0, 0, 0);
                d.setUTCDate(d.getUTCDate() + dayOffset);
                return d;
              })()}
              bookings={filtered}
              staff={staff}
              customers={customers}
              services={services}
              colors={colors}
              staffFilter={staffFilter}
              businessHours={businessHours}
              onSelectBooking={(b) => setViewing(b)}
              onSelectSlot={(slot) => {
                if (newBookingDisabled) return;
                setSlotPrefill(slot);
                setCreating(true);
              }}
              onUnavailableSlot={({ staffName, reason }) => {
                const label =
                  reason === "closed"
                    ? `${staffName} werkt niet op deze dag`
                    : reason === "break"
                      ? `${staffName} heeft pauze op dat tijdstip`
                      : `Buiten werkuren van ${staffName}`;
                toast.warning(label, {
                  description: "Kies een tijdstip binnen de werkuren of wijzig het rooster van de medewerker.",
                });
              }}
            />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">{t("calendar.when")}</th>
                    <th className="hidden px-4 py-3 text-left sm:table-cell">{t("calendar.customer")}</th>
                    <th className="hidden px-4 py-3 text-left md:table-cell">{t("calendar.service")}</th>
                    <th className="px-4 py-3 text-left">{t("calendar.staffCol")}</th>
                    <th className="px-4 py-3 text-right">{t("calendar.amount")}</th>
                    <th className="px-4 py-3 text-left">{t("calendar.status")}</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((b) => {
                    const cust = customers.find((c) => c.id === b.customer_id);
                    const svc = services.find((s) => s.id === b.service_id);
                    const stf = staff.find((s) => s.id === b.staff_id);
                    return (
                      <tr key={b.id} onClick={() => setViewing(b)} className="cursor-pointer hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <p className="font-medium">{formatTime(b.starts_at)}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(b.starts_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" })}
                          </p>
                        </td>
                        <td className="hidden px-4 py-3 sm:table-cell">{cust?.full_name ?? "—"}</td>
                        <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">{svc?.name ?? "—"}</td>
                        <td className="px-4 py-3">
                          {stf ? (() => {
                            const c = colors.get(stf.id);
                            return (
                              <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${c.bg} ${c.text}`}>
                                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${c.dot}`}>
                                  {staffInitials(stf.full_name)}
                                </span>
                                <span className="max-w-[120px] truncate">{stf.full_name}</span>
                              </span>
                            );
                          })() : (
                            <span className="text-xs text-muted-foreground italic">{t("calendar.unassigned") ?? "Niet toegewezen"}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">{formatCents(b.price_cents)}</td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <Select value={b.status} disabled={readOnly} onValueChange={(v) => updateStatus.mutate({ id: b.id, status: v as BookingWithRelations["status"] })}>
                            <SelectTrigger
                              className="h-8 w-[120px] text-xs"
                              title={readOnly ? t("impersonate.readOnlyTooltip") : undefined}
                            ><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {statuses.filter((s) => s !== "all").map((s) => (
                                <SelectItem key={s} value={s}>{statusLabel[s]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" disabled={readOnly} title={readOnly ? t("impersonate.readOnlyTooltip") : undefined} onClick={() => setEditing(b)}>{t("calendar.edit")}</Button>
                          <Button variant="ghost" size="sm" disabled={readOnly} title={readOnly ? t("impersonate.readOnlyTooltip") : undefined} onClick={() => setDeleting(b)}>{t("calendar.delete")}</Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <BookingFormDialog
        open={creating || !!editing}
        onClose={() => { setCreating(false); setEditing(null); setSlotPrefill(null); }}
        booking={editing}
        shopId={shopId}
        prefill={!editing ? slotPrefill : null}
      />

      <BookingActionDialog
        booking={viewing}
        onClose={() => setViewing(null)}
        onEdit={(b) => { setViewing(null); setEditing(b); }}
        onAction={(id, status) => { updateStatus.mutate({ id, status }); setViewing(null); }}
        customers={customers}
        services={services}
        staff={staff}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("calendar.deleteBooking")}</AlertDialogTitle>
            <AlertDialogDescription>{t("calendar.deleteBookingDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("calendar.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && remove.mutate(deleting.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("calendar.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ShopLayout>
  );
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function BookingFormDialog({ open, onClose, booking, shopId, prefill }: { open: boolean; onClose: () => void; booking: BookingWithRelations | null; shopId: string | null; prefill?: { staffId: string | null; startsAt: Date } | null }) {
  const qc = useQueryClient();
  const { t } = useT();
  const { data: customers = [] } = useQuery({ ...customersQuery(shopId ?? ""), enabled: !!shopId && open });
  const { data: services = [] } = useQuery({ ...servicesQuery(shopId ?? ""), enabled: !!shopId && open });
  const { data: staff = [] } = useQuery({ ...staffQuery(shopId ?? ""), enabled: !!shopId && open });

  const statusLabel: Record<string, string> = {
    pending: t("calendar.pending"), confirmed: t("calendar.confirmed"),
    completed: t("calendar.completed"), cancelled: t("calendar.cancelled"), no_show: t("calendar.noShow"),
  };

  const [form, setForm] = useState({ customer_id: "", service_id: "", staff_id: "", starts_at: "", duration: 60, status: "pending" as BookingWithRelations["status"], notes: "" });

  // Reset / hydrate the form whenever the dialog opens or the edited booking changes.
  // Doing this in useEffect (instead of during render) avoids the infinite-render
  // loop that previously crashed the page when "Nieuwe boeking" was clicked.
  useEffect(() => {
    if (!open) return;
    const dur = booking ? Math.round((+new Date(booking.ends_at) - +new Date(booking.starts_at)) / 60000) : 60;
    setForm({
      customer_id: booking?.customer_id ?? "",
      service_id: booking?.service_id ?? "",
      staff_id: booking?.staff_id ?? prefill?.staffId ?? "",
      starts_at: toLocalInput(booking?.starts_at ?? prefill?.startsAt?.toISOString() ?? null),
      duration: dur,
      status: booking?.status ?? "pending",
      notes: booking?.notes ?? "",
    });
  }, [open, booking?.id, prefill?.staffId, prefill?.startsAt?.getTime()]);

  const save = useMutation({
    mutationFn: async () => {
      assertNotImpersonating();
      if (!shopId) throw new Error(t("errors.noActiveShop"));
      if (!form.starts_at) throw new Error(t("errors.pickStartTime"));
      const svc = services.find((s) => s.id === form.service_id);
      const startUtc = new Date(form.starts_at + "Z");
      const ends = new Date(startUtc.getTime() + form.duration * 60000);

      // Pre-flight conflict check: only when staff is assigned and booking is not cancelled/no_show.
      if (form.staff_id && form.status !== "cancelled" && form.status !== "no_show") {
        const { data: conflicts, error: cErr } = await supabase
          .from("bookings")
          .select("id, starts_at, ends_at, customer_id, service_id, status")
          .eq("shop_id", shopId)
          .eq("staff_id", form.staff_id)
          .not("status", "in", "(cancelled,no_show)")
          .lt("starts_at", ends.toISOString())
          .gt("ends_at", startUtc.toISOString())
          .limit(2);
        if (cErr) throw cErr;
        const conflict = (conflicts ?? []).find((c) => c.id !== booking?.id);
        if (conflict) {
          const stf = staff.find((s) => s.id === form.staff_id);
          const cust = customers.find((c) => c.id === conflict.customer_id);
          const svcName = services.find((s) => s.id === conflict.service_id)?.name;
          const range = `${formatTime(conflict.starts_at)}–${formatTime(conflict.ends_at)}`;
          throw new Error(
            t("calendar.conflictWith", {
              staff: stf?.full_name ?? t("calendar.staffCol"),
              customer: cust?.full_name ?? t("dashboard.unknown"),
              service: svcName ?? "—",
              range,
            }),
          );
        }
      }

      const payload = { shop_id: shopId, customer_id: form.customer_id || null, service_id: form.service_id || null, staff_id: form.staff_id || null, starts_at: startUtc.toISOString(), ends_at: ends.toISOString(), status: form.status, price_cents: svc?.price_cents ?? booking?.price_cents ?? 0, deposit_cents: svc?.deposit_cents ?? booking?.deposit_cents ?? 0, notes: form.notes || null };
      if (booking) { const { error } = await supabase.from("bookings").update(payload).eq("id", booking.id); if (error) throw error; }
      else { const { error } = await supabase.from("bookings").insert(payload); if (error) throw error; }
    },
    onSuccess: () => { toast.success(booking ? t("calendar.bookingUpdated") : t("calendar.bookingCreated")); onClose(); if (shopId) qc.invalidateQueries({ queryKey: shopKeys.bookings(shopId) }); },
    onError: (e: Error) => {
      // Map DB-side trigger errors (race conditions) to a friendly message.
      if (e.message?.includes("BOOKING_CONFLICT")) {
        toast.error(t("calendar.conflictGeneric"));
      } else {
        toast.error(e.message);
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{booking ? t("calendar.editBooking") : t("calendar.newBookingTitle")}</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-2">
          <div>
            <Label>{t("calendar.customer")}</Label>
            <CustomerCombobox
              customers={customers}
              value={form.customer_id}
              onChange={(v) => setForm({ ...form, customer_id: v })}
              onClose={onClose}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("calendar.service")}</Label>
              <Select value={form.service_id} onValueChange={(v) => { const svc = services.find((s) => s.id === v); setForm({ ...form, service_id: v, duration: svc?.duration_minutes ?? form.duration }); }}>
                <SelectTrigger><SelectValue placeholder={t("calendar.pickService")} /></SelectTrigger>
                <SelectContent>{services.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("calendar.staffCol")}</Label>
              <Select value={form.staff_id} onValueChange={(v) => setForm({ ...form, staff_id: v })}>
                <SelectTrigger><SelectValue placeholder={t("calendar.pickStaff")} /></SelectTrigger>
                <SelectContent>{staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="dt">{t("calendar.startUTC")}</Label><Input id="dt" type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} /></div>
            <div><Label htmlFor="du">{t("calendar.duration")}</Label><Input id="du" type="number" value={form.duration} onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })} /></div>
          </div>
          <div>
            <Label>{t("calendar.status")}</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as BookingWithRelations["status"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(["pending", "confirmed", "completed", "cancelled", "no_show"] as const).map((s) => <SelectItem key={s} value={s}>{statusLabel[s]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label htmlFor="nt">{t("calendar.notes")}</Label><Input id="nt" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("calendar.cancel")}</Button>
          <Button variant="hero" onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? t("calendar.saving") : booking ? t("calendar.save") : t("calendar.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type CustomerLite = { id: string; full_name: string; email: string | null; phone: string | null };

function CustomerCombobox({
  customers, value, onChange, onClose,
}: {
  customers: CustomerLite[];
  value: string;
  onChange: (id: string) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = useMemo(() => customers.find((c) => c.id === value) ?? null, [customers, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => {
      const name = c.full_name.toLowerCase();
      const phone = (c.phone ?? "").toLowerCase();
      const email = (c.email ?? "").toLowerCase();
      return name.includes(q) || phone.includes(q) || email.includes(q);
    });
  }, [customers, query]);

  const hasCustomers = customers.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected
              ? selected.full_name + (selected.phone ? ` · ${selected.phone}` : "")
              : t("calendar.pickCustomer")}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="z-[60] w-[--radix-popover-trigger-width] p-0"
        align="start"
        sideOffset={4}
      >
        {hasCustomers ? (
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={t("customers.searchPlaceholder")}
              value={query}
              onValueChange={setQuery}
              autoFocus
            />
            <CommandList className="max-h-64">
              <CommandEmpty>
                <div className="flex flex-col items-center gap-2 py-2 text-sm">
                  <span className="text-muted-foreground">{t("customers.noMatches")}</span>
                  <Button asChild size="sm" variant="outline" onClick={() => { setOpen(false); onClose(); }}>
                    <Link to="/shop/customers">
                      <UserPlus className="h-4 w-4" /> {t("customers.addCustomer")}
                    </Link>
                  </Button>
                </div>
              </CommandEmpty>
              <CommandGroup>
                {filtered.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={c.id}
                    onSelect={() => {
                      onChange(c.id);
                      setOpen(false);
                      setQuery("");
                    }}
                    className="flex items-center justify-between gap-2"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{c.full_name}</span>
                      {(c.phone || c.email) && (
                        <span className="truncate text-xs text-muted-foreground">
                          {c.phone || c.email}
                        </span>
                      )}
                    </div>
                    <Check
                      className={cn(
                        "h-4 w-4 shrink-0",
                        value === c.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        ) : (
          <div className="flex flex-col items-center gap-3 p-6 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <Search className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">{t("customers.noCustomers")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("customers.noCustomersDesc")}</p>
            </div>
            <Button asChild size="sm" variant="hero" onClick={() => { setOpen(false); onClose(); }}>
              <Link to="/shop/customers">
                <UserPlus className="h-4 w-4" /> {t("customers.addCustomer")}
              </Link>
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function BookingActionDialog({
  booking, onClose, onEdit, onAction, customers, services, staff,
}: {
  booking: BookingWithRelations | null;
  onClose: () => void;
  onEdit: (b: BookingWithRelations) => void;
  onAction: (id: string, status: BookingWithRelations["status"]) => void;
  customers: Array<{ id: string; full_name: string; email: string | null; phone: string | null }>;
  services: Array<{ id: string; name: string }>;
  staff: Array<{ id: string; full_name: string }>;
}) {
  const shopId = useActiveShopId();
  const colors = useStaffColors(shopId);
  if (!booking) return null;
  const cust = customers.find((c) => c.id === booking.customer_id);
  const svc = services.find((s) => s.id === booking.service_id);
  const stf = staff.find((s) => s.id === booking.staff_id);
  return (
    <Dialog open={!!booking} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Afspraak details</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2 text-sm">
          <div className="rounded-xl bg-muted/40 p-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Wanneer</p>
            <p className="mt-1 font-medium">
              {new Date(booking.starts_at).toLocaleDateString("nl-NL", { weekday: "long", day: "2-digit", month: "long", timeZone: "UTC" })}
              {" · "}
              {formatTime(booking.starts_at)}
            </p>
          </div>
          <div className="grid gap-2">
            <ActionRow label="Klant" value={cust?.full_name ?? "—"} sub={cust?.email ?? cust?.phone ?? undefined} />
            <ActionRow label="Service" value={svc?.name ?? "—"} />
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">Medewerker</span>
              {stf ? (() => {
                const c = colors.get(stf.id);
                return (
                  <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", c.bg, c.text)}>
                    <span className={cn("flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold", c.dot)}>
                      {staffInitials(stf.full_name)}
                    </span>
                    <span className="max-w-[160px] truncate">{stf.full_name}</span>
                  </span>
                );
              })() : (
                <span className="text-xs italic text-muted-foreground">Niet toegewezen</span>
              )}
            </div>
            <ActionRow label="Bedrag" value={formatCents(booking.price_cents)} />
          </div>
          {booking.notes && (
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Notities</p>
              <p className="mt-1 whitespace-pre-wrap">{booking.notes}</p>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 pt-2">
          <Button variant="default" disabled={booking.status === "confirmed"} onClick={() => onAction(booking.id, "confirmed")}>
            Bevestigen
          </Button>
          <Button variant="hero" disabled={booking.status === "completed"} onClick={() => onAction(booking.id, "completed")}>
            Voltooien
          </Button>
          <Button variant="outline" disabled={booking.status === "cancelled"} onClick={() => onAction(booking.id, "cancelled")}>
            Annuleren
          </Button>
          <Button
            variant="outline"
            disabled={booking.status === "no_show"}
            onClick={() => onAction(booking.id, "no_show")}
            className="text-destructive border-destructive/30 hover:bg-destructive/10"
          >
            <UserX className="h-4 w-4" /> No-show
          </Button>
        </div>
        <DialogFooter className="mt-2 flex-row justify-between sm:justify-between">
          <Button variant="ghost" size="sm" onClick={() => onEdit(booking)}>Bewerken</Button>
          <Button variant="ghost" size="sm" onClick={onClose}>Sluiten</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ActionRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-right">
        <span className="block font-medium">{value}</span>
        {sub && <span className="block text-xs text-muted-foreground">{sub}</span>}
      </span>
    </div>
  );
}
