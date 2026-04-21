import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { formatCents, formatTime } from "@/lib/format";
import { staffInitials, type StaffColor } from "@/lib/staff-color";
import type { BookingWithRelations } from "@/lib/queries";
import {
  parseMinutes,
  resolveStaffAvailability as resolveStaffAvailabilityCore,
  type AvailabilityWindow,
  type BusinessHours as SharedBusinessHours,
  type DayKey,
  type StaffAvailability,
  type StaffDayHours as SharedStaffDayHours,
  type StaffWorkingHours as SharedStaffWorkingHours,
} from "@/lib/staff-availability";

/**
 * Visuele dag-rooster (tijdgrid) voor de shop-kalender.
 *
 * - Rijen: uren (configureerbaar via START_HOUR/END_HOUR)
 * - Kolommen: één per actieve medewerker + één "niet toegewezen" kolom
 * - Bookings worden absoluut gepositioneerd binnen hun kolom op basis van
 *   starts_at / ends_at (UTC). Half-open interval [starts_at, ends_at).
 *
 * Pure presentatie — alle data komt van buitenaf, geen mutaties.
 * Werkuren-/pauze-logica is geëxtraheerd naar `@/lib/staff-availability` en
 * wordt hier alleen geconsumeerd (één bron van waarheid voor visuele overlay
 * én client-side pre-validatie in de booking-dialog).
 */

const DEFAULT_START_HOUR = 8; // fallback wanneer er geen business_hours zijn
const DEFAULT_END_HOUR = 21;
const MIN_HOUR = 6;
const MAX_HOUR = 23;
const MIN_WINDOW_HOURS = 4;
const SLOT_MINUTES = 60;
const SNAP_MINUTES = 15; // Drag-and-drop snap-raster (15 min)
const PX_PER_HOUR = 64; // 64px per uur → 1 min ≈ 1.07px
const PX_PER_MIN = PX_PER_HOUR / 60;

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export type DayHours = { open?: string; close?: string; closed?: boolean };
export type BusinessHours = SharedBusinessHours;

/** Per-medewerker werkuren-shape (zelfde dag-keys als BusinessHours, plus optionele breaks). */
export type StaffDayHours = SharedStaffDayHours;
export type StaffWorkingHours = SharedStaffWorkingHours;

/** Minuten sinds middernacht → "HH:MM". */
function formatMinutes(mins: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, Math.round(mins)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "HH:MM" → uur (afgerond omlaag voor open, omhoog voor close). Returns null bij ongeldig. */
function parseHour(value: string | undefined, mode: "floor" | "ceil"): number | null {
  const mins = parseMinutes(value);
  if (mins == null) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (mode === "floor") return h;
  return m > 0 ? Math.min(24, h + 1) : h;
}

/** Bereken weergave-venster voor een dag op basis van business_hours. */
function resolveDayWindow(
  day: Date,
  businessHours: BusinessHours | undefined,
): { startHour: number; endHour: number; isClosed: boolean } {
  const fallback = { startHour: DEFAULT_START_HOUR, endHour: DEFAULT_END_HOUR, isClosed: false };
  if (!businessHours) return fallback;
  const key = DAY_KEYS[day.getUTCDay()] as DayKey;
  const dh = businessHours[key];
  if (!dh) return fallback;
  if (dh.closed) return { ...fallback, isClosed: true };
  const open = parseHour(dh.open, "floor");
  const close = parseHour(dh.close, "ceil");
  if (open == null || close == null || close <= open) return fallback;
  let start = Math.max(MIN_HOUR, Math.min(MAX_HOUR - MIN_WINDOW_HOURS, open));
  let end = Math.min(MAX_HOUR, Math.max(start + MIN_WINDOW_HOURS, close));
  if (end - start < MIN_WINDOW_HOURS) end = Math.min(MAX_HOUR, start + MIN_WINDOW_HOURS);
  return { startHour: start, endHour: end, isClosed: false };
}

/** Wrapper die naar het uur-venster (in minuten) clampt. Reuses shared core. */
function resolveStaffAvailability(
  day: Date,
  wh: StaffWorkingHours | undefined,
  windowStartHour: number,
  windowEndHour: number,
): StaffAvailability {
  return resolveStaffAvailabilityCore(day, wh, windowStartHour * 60, windowEndHour * 60);
}


type StaffLite = {
  id: string;
  full_name: string;
  is_active: boolean;
  working_hours?: unknown;
};

type CustomerLite = { id: string; full_name: string };
type ServiceLite = { id: string; name: string };

/** Resolver-shape die useStaffColors() teruggeeft. */
type ColorResolver = {
  get: (staffId: string | null | undefined) => StaffColor;
};

export type DayTimeGridProps = {
  /** Lokale dag (UTC midnight) waarvoor het rooster wordt getoond. */
  day: Date;
  bookings: BookingWithRelations[];
  staff: StaffLite[];
  customers: CustomerLite[];
  services: ServiceLite[];
  colors: ColorResolver;
  /** Filter op één staff_id, "all", of "unassigned". */
  staffFilter: string | "all" | "unassigned";
  /** Optioneel: shop business_hours per weekdag, gebruikt om het tijdvenster dynamisch te bepalen. */
  businessHours?: BusinessHours;
  onSelectBooking?: (b: BookingWithRelations) => void;
  /** Klik op een lege cel → opent nieuwe boeking voor (staffId, time). */
  onSelectSlot?: (params: { staffId: string | null; startsAt: Date }) => void;
  /** Klik op een onbeschikbare zone (closed/break/buiten werkuren) → UI hint. */
  onUnavailableSlot?: (params: { staffId: string | null; staffName: string; reason: "closed" | "break" | "off_hours" }) => void;
  /**
   * Drag-and-drop reschedule. Wordt aangeroepen wanneer een booking-block naar
   * een nieuwe (staff, time) wordt gesleept. Snapt aan SNAP_MINUTES (15min).
   * Server-trigger valideert working hours + conflicts; client doet alleen
   * optimistic update via deze callback.
   */
  onReschedule?: (params: {
    booking: BookingWithRelations;
    newStaffId: string | null;
    newStartsAt: Date;
    /** Optioneel — wanneer gezet, override van de afgeleide einde (voor resize-flow). */
    newEndsAt?: Date;
  }) => void;
  /** i18n-label voor de resize-handle (tooltip + aria). */
  resizeHandleLabel?: string;
};

type Column = {
  key: string;
  label: string;
  staffId: string | null; // null = unassigned
  color: StaffColor | null;
  workingHours?: StaffWorkingHours;
};

export function DayTimeGrid({
  day,
  bookings,
  staff,
  customers,
  services,
  colors,
  staffFilter,
  businessHours,
  onSelectBooking,
  onSelectSlot,
  onUnavailableSlot,
  onReschedule,
  resizeHandleLabel,
}: DayTimeGridProps) {
  const dayStart = useMemo(() => {
    const d = new Date(day);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }, [day]);
  const dayEnd = useMemo(() => {
    const d = new Date(dayStart);
    d.setUTCDate(d.getUTCDate() + 1);
    return d;
  }, [dayStart]);

  // Kolommen bepalen op basis van actieve medewerkers + filter.
  const columns: Column[] = useMemo(() => {
    const activeStaff = staff.filter((s) => s.is_active);
    const allCols: Column[] = activeStaff.map((s) => ({
      key: s.id,
      label: s.full_name,
      staffId: s.id,
      color: colors.get(s.id),
      workingHours: (s.working_hours ?? undefined) as StaffWorkingHours | undefined,
    }));
    // Voeg "niet toegewezen" alleen toe als er bookings zonder staff zijn op deze dag.
    const hasUnassigned = bookings.some(
      (b) =>
        !b.staff_id &&
        new Date(b.starts_at) >= dayStart &&
        new Date(b.starts_at) < dayEnd,
    );
    if (hasUnassigned) {
      allCols.push({ key: "__unassigned__", label: "Niet toegewezen", staffId: null, color: null });
    }
    if (staffFilter === "all") return allCols;
    if (staffFilter === "unassigned")
      return allCols.filter((c) => c.staffId === null);
    return allCols.filter((c) => c.staffId === staffFilter);
  }, [staff, colors, staffFilter, bookings, dayStart, dayEnd]);

  // Bookings binnen deze dag, gefilterd door kolommen.
  const visibleBookings = useMemo(() => {
    const colSet = new Set(columns.map((c) => c.staffId));
    return bookings.filter((b) => {
      const start = new Date(b.starts_at);
      if (start < dayStart || start >= dayEnd) return false;
      return colSet.has(b.staff_id ?? null);
    });
  }, [bookings, columns, dayStart, dayEnd]);

  // Dynamisch venster op basis van business_hours per weekdag.
  const { startHour: START_HOUR, endHour: END_HOUR, isClosed } = useMemo(
    () => resolveDayWindow(dayStart, businessHours),
    [dayStart, businessHours],
  );

  // Drag-preview: gesnapte drop-positie binnen één kolom (tijdelijke UI-state).
  const grabOffsetRef = useRef<number>(0);
  const [dragPreview, setDragPreview] = useState<
    { colKey: string; topPx: number; label: string } | null
  >(null);

  // Resize-state: actieve booking + live nieuwe duur in minuten (gesnapt).
  const [resizing, setResizing] = useState<
    { bookingId: string; colKey: string; startTopPx: number; newDurMin: number; label: string } | null
  >(null);

  const hours = useMemo(() => {
    const arr: number[] = [];
    for (let h = START_HOUR; h <= END_HOUR; h += 1) arr.push(h);
    return arr;
  }, [START_HOUR, END_HOUR]);

  const totalHeight = (END_HOUR - START_HOUR) * PX_PER_HOUR;

  // Per kolom availability uitrekenen op basis van staff.working_hours.
  const availabilityByColumn = useMemo(() => {
    const map = new Map<string, StaffAvailability>();
    for (const c of columns) {
      if (c.staffId == null) continue; // unassigned: geen overlay
      map.set(c.key, resolveStaffAvailability(dayStart, c.workingHours, START_HOUR, END_HOUR));
    }
    return map;
  }, [columns, dayStart, START_HOUR, END_HOUR]);

  /** Bepaal of een uur-slot binnen een unavailable zone valt voor een kolom. */
  function slotReason(colKey: string, hour: number): "closed" | "break" | "off_hours" | null {
    const av = availabilityByColumn.get(colKey);
    if (!av || !av.hasStructuredData) return null;
    if (av.dayClosed) return "closed";
    const slotStart = hour * 60;
    const slotEnd = slotStart + 60;
    // In een break? (volledige overlap met break-interval volstaat voor blokkade)
    for (const br of av.breaks) {
      if (slotStart < br.endMin && slotEnd > br.startMin) return "break";
    }
    // Binnen working window?
    const inside = av.working.some((w) => slotStart >= w.startMin && slotEnd <= w.endMin);
    return inside ? null : "off_hours";
  }

  // "Now"-lijn alleen tonen wanneer de kalenderdag === vandaag (UTC).
  const now = new Date();
  const todayKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`;
  const dayKey = `${dayStart.getUTCFullYear()}-${dayStart.getUTCMonth()}-${dayStart.getUTCDate()}`;
  const showNow = todayKey === dayKey;
  const nowMinutes =
    now.getUTCHours() * 60 + now.getUTCMinutes() - START_HOUR * 60;
  const nowTop = showNow && nowMinutes >= 0 && nowMinutes <= (END_HOUR - START_HOUR) * 60
    ? nowMinutes * PX_PER_MIN
    : null;

  if (columns.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Geen actieve medewerker geselecteerd voor deze dag.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
      {isClosed && (
        <div className="border-b border-border bg-muted/30 px-4 py-2 text-center text-xs text-muted-foreground">
          Salon gesloten op deze dag — venster toont standaardtijden ({String(START_HOUR).padStart(2, "0")}:00–{String(END_HOUR).padStart(2, "0")}:00).
        </div>
      )}
      <div className="overflow-x-auto">
        <div
          className="grid min-w-[640px]"
          style={{
            gridTemplateColumns: `64px repeat(${columns.length}, minmax(160px, 1fr))`,
          }}
        >
          {/* Header: tijd-kolom label + medewerker-headers */}
          <div className="sticky top-0 z-10 border-b border-border bg-muted/40 px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Tijd
          </div>
          {columns.map((c) => (
            <div
              key={`h-${c.key}`}
              className="sticky top-0 z-10 flex items-center gap-2 border-b border-l border-border bg-muted/40 px-3 py-2"
            >
              {c.color ? (
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold",
                    c.color.dot,
                  )}
                >
                  {staffInitials(c.label)}
                </span>
              ) : (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted-foreground/15 text-[10px] font-semibold italic text-muted-foreground">
                  —
                </span>
              )}
              <span className="truncate text-xs font-medium">{c.label}</span>
            </div>
          ))}

          {/* Body: één grid-cell per kolom, met absoluut gepositioneerde rijen + bookings */}
          <div className="relative border-r border-border" style={{ height: totalHeight }}>
            {hours.map((h, i) => (
              <div
                key={`time-${h}`}
                className="absolute left-0 right-0 -translate-y-2 px-2 text-right text-[10px] font-medium tabular-nums text-muted-foreground"
                style={{ top: i * PX_PER_HOUR }}
              >
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>

          {columns.map((c) => {
            const av = availabilityByColumn.get(c.key);
            const showOverlay = !!av && av.hasStructuredData;
            return (
            <div
              key={`col-${c.key}`}
              className="relative border-l border-border"
              style={{ height: totalHeight }}
              onDragOver={onReschedule ? (e) => {
                // Sta drop alleen toe als er een booking-id meegegeven is.
                if (Array.from(e.dataTransfer.types).includes("application/x-booking-id")) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  // Bereken gesnapte positie + tijd-label voor de drop-indicator.
                  const rect = e.currentTarget.getBoundingClientRect();
                  const yPx = e.clientY - rect.top;
                  const rawMin = yPx / PX_PER_MIN - grabOffsetRef.current;
                  const snapped = Math.round(rawMin / SNAP_MINUTES) * SNAP_MINUTES;
                  const winMin = (END_HOUR - START_HOUR) * 60;
                  const clampedInWin = Math.max(0, Math.min(winMin - SNAP_MINUTES, snapped));
                  const totalMin = START_HOUR * 60 + clampedInWin;
                  setDragPreview({
                    colKey: c.key,
                    topPx: clampedInWin * PX_PER_MIN,
                    label: formatMinutes(totalMin),
                  });
                }
              } : undefined}
              onDragLeave={onReschedule ? (e) => {
                // Alleen resetten wanneer de cursor de kolom-bounds echt verlaat
                // (anders flikkert het tijdens move-events binnen child-elementen).
                const rect = e.currentTarget.getBoundingClientRect();
                if (
                  e.clientX < rect.left ||
                  e.clientX > rect.right ||
                  e.clientY < rect.top ||
                  e.clientY > rect.bottom
                ) {
                  setDragPreview((prev) => (prev?.colKey === c.key ? null : prev));
                }
              } : undefined}
              onDrop={onReschedule ? (e) => {
                const bookingId = e.dataTransfer.getData("application/x-booking-id");
                if (!bookingId) return;
                e.preventDefault();
                setDragPreview(null);
                const grabOffsetMin = Number(e.dataTransfer.getData("application/x-grab-offset-min")) || 0;
                const rect = e.currentTarget.getBoundingClientRect();
                const yPx = e.clientY - rect.top;
                // Pixel → minuten t.o.v. START_HOUR; trek pak-offset af zodat het
                // blok op de exact-zelfde relatieve positie blijft als waar de
                // gebruiker het oppakte.
                const rawMin = yPx / PX_PER_MIN - grabOffsetMin;
                const snapped = Math.round(rawMin / SNAP_MINUTES) * SNAP_MINUTES;
                const totalMinFromMidnight = START_HOUR * 60 + snapped;
                const clamped = Math.max(0, Math.min(24 * 60 - SNAP_MINUTES, totalMinFromMidnight));
                const newStart = new Date(dayStart);
                newStart.setUTCHours(0, 0, 0, 0);
                newStart.setUTCMinutes(clamped);
                const booking = bookings.find((b) => b.id === bookingId);
                if (!booking) return;
                // No-op detectie: zelfde staff en zelfde tijd → niets doen.
                const sameStaff = (booking.staff_id ?? null) === c.staffId;
                const sameTime = new Date(booking.starts_at).getTime() === newStart.getTime();
                if (sameStaff && sameTime) return;
                onReschedule({ booking, newStaffId: c.staffId, newStartsAt: newStart });
              } : undefined}
            >
              {/* Unavailable-overlay: alles buiten working hours wordt grijs gestreept.
                  Wanneer de hele dag gesloten is voor deze medewerker, vullen we de hele kolom. */}
              {showOverlay && (av.dayClosed ? (
                <div
                  className="pointer-events-none absolute inset-x-0 z-[1] bg-muted/40"
                  style={{
                    top: 0,
                    height: totalHeight,
                    backgroundImage:
                      "repeating-linear-gradient(45deg, transparent 0 6px, hsl(var(--muted-foreground) / 0.08) 6px 7px)",
                  }}
                  title={`Niet beschikbaar — ${c.label} werkt vandaag niet`}
                />
              ) : (
                // Render één off-hours-blok vóór de eerste working-window en één erna,
                // plus eventuele gaten tussen working windows.
                (() => {
                  const winStart = START_HOUR * 60;
                  const winEnd = END_HOUR * 60;
                  const wins = av.working.length ? av.working : [{ startMin: winEnd, endMin: winEnd }];
                  const gaps: AvailabilityWindow[] = [];
                  let cursor = winStart;
                  for (const w of wins) {
                    if (w.startMin > cursor) gaps.push({ startMin: cursor, endMin: w.startMin });
                    cursor = Math.max(cursor, w.endMin);
                  }
                  if (cursor < winEnd) gaps.push({ startMin: cursor, endMin: winEnd });
                  return gaps.map((g, i) => (
                    <div
                      key={`off-${c.key}-${i}`}
                      className="pointer-events-none absolute inset-x-0 z-[1] bg-muted/40"
                      style={{
                        top: (g.startMin - winStart) * PX_PER_MIN,
                        height: (g.endMin - g.startMin) * PX_PER_MIN,
                        backgroundImage:
                          "repeating-linear-gradient(45deg, transparent 0 6px, hsl(var(--muted-foreground) / 0.08) 6px 7px)",
                      }}
                      title={`Buiten werkuren ${formatMinutes(g.startMin)}–${formatMinutes(g.endMin)}`}
                    />
                  ));
                })()
              ))}
              {/* Pauze-overlay: subtieler, met andere streep-kleur. */}
              {showOverlay && av.breaks.map((br, i) => (
                <div
                  key={`break-${c.key}-${i}`}
                  className="pointer-events-none absolute inset-x-0 z-[2] bg-warning/10"
                  style={{
                    top: (br.startMin - START_HOUR * 60) * PX_PER_MIN,
                    height: (br.endMin - br.startMin) * PX_PER_MIN,
                    backgroundImage:
                      "repeating-linear-gradient(135deg, transparent 0 5px, hsl(var(--warning) / 0.18) 5px 6px)",
                  }}
                  title={`Pauze ${formatMinutes(br.startMin)}–${formatMinutes(br.endMin)}`}
                />
              ))}
              {/* Uur-grid-lijnen + klikbare slots */}
              {hours.slice(0, -1).map((h, i) => {
                const reason = slotReason(c.key, h);
                const unavailable = reason !== null;
                let unavailableTitle: string | undefined;
                if (unavailable) {
                  if (reason === "closed") {
                    unavailableTitle = `${c.label} werkt vandaag niet`;
                  } else if (reason === "break" && av) {
                    const slotStart = h * 60;
                    const slotEnd = slotStart + 60;
                    const br = av.breaks.find(
                      (b) => slotStart < b.endMin && slotEnd > b.startMin,
                    );
                    unavailableTitle = br
                      ? `Pauze ${formatMinutes(br.startMin)}–${formatMinutes(br.endMin)}`
                      : "Pauze";
                  } else if (reason === "off_hours" && av) {
                    const w = av.working[0];
                    unavailableTitle = w
                      ? `Buiten werkuren — ${c.label} werkt ${formatMinutes(w.startMin)}–${formatMinutes(w.endMin)}`
                      : `Buiten werkuren`;
                  }
                }
                return (
                  <button
                    key={`slot-${c.key}-${h}`}
                    type="button"
                    onClick={() => {
                      if (unavailable) {
                        onUnavailableSlot?.({ staffId: c.staffId, staffName: c.label, reason: reason! });
                        return;
                      }
                      if (!onSelectSlot) return;
                      const startsAt = new Date(dayStart);
                      startsAt.setUTCHours(h, 0, 0, 0);
                      onSelectSlot({ staffId: c.staffId, startsAt });
                    }}
                    className={cn(
                      "absolute left-0 right-0 z-[3] border-t border-dashed border-border/60 transition-colors",
                      unavailable ? "cursor-not-allowed hover:bg-destructive/5" : "hover:bg-primary/5",
                    )}
                    style={{ top: i * PX_PER_HOUR, height: PX_PER_HOUR }}
                    title={unavailableTitle}
                    aria-label={
                      unavailable
                        ? `Niet beschikbaar — ${c.label} ${String(h).padStart(2, "0")}:00${unavailableTitle ? ` (${unavailableTitle})` : ""}`
                        : `Nieuwe boeking ${c.label} ${String(h).padStart(2, "0")}:00`
                    }
                    aria-disabled={unavailable}
                  />
                );
              })}
              {/* Onderste lijn */}
              <div
                className="absolute left-0 right-0 border-t border-dashed border-border/60"
                style={{ top: (hours.length - 1) * PX_PER_HOUR }}
              />

              {/* Now-lijn */}
              {nowTop !== null && (
                <div
                  className="pointer-events-none absolute left-0 right-0 z-10 border-t-2 border-destructive"
                  style={{ top: nowTop }}
                >
                  <span className="absolute -top-2 left-1 h-3 w-3 rounded-full bg-destructive" />
                </div>
              )}

              {/* Drop-indicator: gesnapte horizontale lijn met tijd-label tijdens drag. */}
              {dragPreview && dragPreview.colKey === c.key && (
                <div
                  className="pointer-events-none absolute left-0 right-0 z-[15] border-t-2 border-dashed border-primary"
                  style={{ top: dragPreview.topPx }}
                >
                  <span className="absolute -top-2.5 left-1 rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-primary-foreground shadow-soft">
                    {dragPreview.label}
                  </span>
                </div>
              )}

              {/* Bookings in deze kolom */}
              {visibleBookings
                .filter((b) => (b.staff_id ?? null) === c.staffId)
                .map((b) => {
                  const start = new Date(b.starts_at);
                  const end = new Date(b.ends_at);
                  const startMin =
                    start.getUTCHours() * 60 + start.getUTCMinutes() - START_HOUR * 60;
                  const durMin = Math.max(15, (end.getTime() - start.getTime()) / 60000);
                  const top = Math.max(0, startMin * PX_PER_MIN);
                  const cust = customers.find((x) => x.id === b.customer_id);
                  const svc = services.find((x) => x.id === b.service_id);
                  const isCancelled = b.status === "cancelled" || b.status === "no_show";
                  const tone = c.color;
                  const draggable = !!onReschedule && !isCancelled;
                  const isResizingThis = resizing?.bookingId === b.id;
                  const liveDurMin = isResizingThis ? resizing!.newDurMin : durMin;
                  const liveHeight = Math.max(24, liveDurMin * PX_PER_MIN - 2);
                  return (
                    <div
                      key={b.id}
                      className="absolute left-1 right-1 z-[5]"
                      style={{ top, height: liveHeight }}
                    >
                      <button
                        type="button"
                        draggable={draggable && !isResizingThis}
                        onDragStart={draggable ? (e) => {
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("application/x-booking-id", b.id);
                          // Bewaar waar binnen het blok de gebruiker pakte (in min),
                          // zodat de drop dat behoudt en het blok visueel "stil staat".
                          const blockRect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                          const grabPx = e.clientY - blockRect.top;
                          const grabMin = Math.max(0, grabPx / PX_PER_MIN);
                          grabOffsetRef.current = grabMin;
                          e.dataTransfer.setData("application/x-grab-offset-min", String(grabMin));
                        } : undefined}
                        onClick={() => {
                          if (isResizingThis) return;
                          onSelectBooking?.(b);
                        }}
                        className={cn(
                          "block h-full w-full overflow-hidden rounded-lg border px-2 py-1 text-left text-[11px] shadow-soft transition-transform hover:z-20 hover:scale-[1.01]",
                          draggable && !isResizingThis && "cursor-grab active:cursor-grabbing active:opacity-70",
                          tone
                            ? `${tone.bg} ${tone.text} border-transparent`
                            : "border-border bg-muted text-foreground",
                          isCancelled && "opacity-60 line-through decoration-1",
                          isResizingThis && "ring-2 ring-primary/60",
                        )}
                        title={`${cust?.full_name ?? "—"} · ${svc?.name ?? "—"} · ${formatTime(b.starts_at)}–${formatTime(b.ends_at)}${draggable ? " · Sleep om te verplaatsen" : ""}`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="truncate font-semibold">
                            {formatTime(b.starts_at)}
                          </span>
                          <span className="shrink-0 text-[10px] font-medium tabular-nums opacity-90">
                            {formatCents(b.price_cents)}
                          </span>
                        </div>
                        <div className="truncate font-medium">
                          {cust?.full_name ?? "—"}
                        </div>
                        {liveHeight > 44 && (
                          <div className="truncate text-[10px] opacity-90">
                            {svc?.name ?? "—"}
                          </div>
                        )}
                      </button>
                      {/* Resize-handle: alleen wanneer reschedule beschikbaar is en booking actief is. */}
                      {draggable && (
                        <div
                          role="slider"
                          aria-label={resizeHandleLabel ?? "Sleep om duur aan te passen"}
                          aria-valuemin={15}
                          aria-valuenow={Math.round(liveDurMin)}
                          tabIndex={-1}
                          title={resizeHandleLabel ?? "Sleep om duur aan te passen"}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const startTopPx = top;
                            const startY = e.clientY;
                            const startDur = durMin;
                            const winMin = (END_HOUR - START_HOUR) * 60;
                            const startMinAbs = startMin; // relatief t.o.v. window-start
                            const maxDur = Math.max(SNAP_MINUTES, winMin - startMinAbs);
                            const onMove = (ev: MouseEvent) => {
                              const dy = ev.clientY - startY;
                              const rawDur = startDur + dy / PX_PER_MIN;
                              const snapped = Math.round(rawDur / SNAP_MINUTES) * SNAP_MINUTES;
                              const clamped = Math.max(SNAP_MINUTES, Math.min(maxDur, snapped));
                              const endTotalMin = START_HOUR * 60 + startMinAbs + clamped;
                              setResizing({
                                bookingId: b.id,
                                colKey: c.key,
                                startTopPx,
                                newDurMin: clamped,
                                label: formatMinutes(endTotalMin),
                              });
                            };
                            const onUp = () => {
                              window.removeEventListener("mousemove", onMove);
                              window.removeEventListener("mouseup", onUp);
                              setResizing((cur) => {
                                if (!cur || cur.bookingId !== b.id) return null;
                                // Commit alleen wanneer duur daadwerkelijk veranderd is.
                                if (Math.round(cur.newDurMin) !== Math.round(durMin) && onReschedule) {
                                  const newEnds = new Date(start.getTime() + cur.newDurMin * 60_000);
                                  onReschedule({
                                    booking: b,
                                    newStaffId: c.staffId,
                                    newStartsAt: start,
                                    newEndsAt: newEnds,
                                  });
                                }
                                return null;
                              });
                            };
                            window.addEventListener("mousemove", onMove);
                            window.addEventListener("mouseup", onUp);
                            setResizing({
                              bookingId: b.id,
                              colKey: c.key,
                              startTopPx,
                              newDurMin: startDur,
                              label: formatMinutes(START_HOUR * 60 + startMinAbs + startDur),
                            });
                          }}
                          className={cn(
                            "absolute inset-x-0 bottom-0 z-[6] flex h-2.5 cursor-ns-resize items-center justify-center rounded-b-lg",
                            "opacity-0 transition-opacity hover:opacity-100",
                            isResizingThis && "opacity-100",
                          )}
                        >
                          <span className="h-1 w-8 rounded-full bg-foreground/30" />
                        </div>
                      )}
                      {/* Live tijd-badge tijdens resize. */}
                      {isResizingThis && (
                        <span className="pointer-events-none absolute -bottom-2.5 right-1 z-[16] rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-primary-foreground shadow-soft">
                          {resizing!.label}
                        </span>
                      )}
                    </div>
                  );
                })}
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
