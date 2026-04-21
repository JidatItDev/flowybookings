import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { formatCents, formatTime } from "@/lib/format";
import { staffInitials, type StaffColor } from "@/lib/staff-color";
import type { BookingWithRelations } from "@/lib/queries";
import { createEdgeAutoScroller } from "@/lib/auto-scroll-edge";
import {
  parseMinutes,
  resolveStaffAvailability as resolveStaffAvailabilityCore,
  validateBookingSlot,
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
  /** i18n-labels voor invalid drop-redenen (per-staff working-hours pre-validatie). */
  dropInvalidLabels?: {
    closedDay: string;
    offHours: (range: string) => string;
    duringBreak: (range: string) => string;
    /** Resize-flow: nieuwe ends_at overlapt met andere booking van dezelfde medewerker. */
    conflictWith?: (range: string) => string;
  };
  /**
   * Aangeroepen wanneer een drop/resize fysiek geblokkeerd is door pre-validatie
   * (werkuren/pauze/conflict). De parent kan hierop bv. een toast tonen — de
   * `reason` is al gelokaliseerd via `dropInvalidLabels`.
   */
  onDropBlocked?: (reason: string) => void;
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
  dropInvalidLabels,
  onDropBlocked,
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
  // Booking-id van het actief gesleepte blok — tijdens dragOver is
  // dataTransfer.getData() niet leesbaar (browser-restrictie), dus we cachen
  // hier de id zodat we tijdens dragOver de juiste duur + conflict-check
  // kunnen uitvoeren tegen visibleBookings.
  const draggedIdRef = useRef<string | null>(null);
  // Na een keyboard-reschedule (pijltjestoetsen) wordt het bookings-array
  // opnieuw geladen, waardoor de DOM-node van de gefocuste booking wordt
  // vervangen en focus naar <body> springt. We onthouden hier de id zodat
  // we na re-render de focus terug kunnen zetten op hetzelfde blok.
  const restoreFocusIdRef = useRef<string | null>(null);
  useEffect(() => {
    const id = restoreFocusIdRef.current;
    if (!id) return;
    const el = document.querySelector<HTMLElement>(`[data-booking-id="${CSS.escape(id)}"]`);
    if (el) {
      el.focus({ preventScroll: false });
      // Houd het blok in beeld zonder de pagina naar boven te scrollen.
      el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
      restoreFocusIdRef.current = null;
    }
  }, [bookings]);
  const [dragPreview, setDragPreview] = useState<
    { colKey: string; topPx: number; label: string; invalid?: boolean; reason?: string } | null
  >(null);

  // Resize-state: actieve booking + live nieuwe duur in minuten (gesnapt).
  // `invalid` + `reason` worden gezet wanneer de nieuwe ends_at in een pauze of
  // buiten werkuren van de toegewezen medewerker valt (pre-validatie).
  const [resizing, setResizing] = useState<
    {
      bookingId: string;
      colKey: string;
      startTopPx: number;
      newDurMin: number;
      label: string;
      invalid?: boolean;
      reason?: string;
    } | null
  >(null);

  // Touch drag-and-drop: native HTML5 drag werkt niet op touch (iPad/tablet).
  // We implementeren een long-press → move → drop flow met dezelfde snap- en
  // pre-validatie-logica als de mouse drag-flow. State houdt de actief
  // "opgepakte" booking + grab-offset bij; visuele feedback via dragPreview.
  const [touchDrag, setTouchDrag] = useState<{ bookingId: string } | null>(null);

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
              data-col-key={c.key}
              data-col-staff-id={c.staffId ?? ""}
              className="relative border-l border-border"
              style={{ height: totalHeight }}
              onDragOver={onReschedule ? (e) => {
                // Sta drop alleen toe als er een booking-id meegegeven is.
                if (Array.from(e.dataTransfer.types).includes("application/x-booking-id")) {
                  e.preventDefault();
                  // dropEffect wordt verderop op "none" gezet bij invalid, zodat
                  // de browser de "verboden"-cursor toont en de drop blokkeert.
                  e.dataTransfer.dropEffect = "move";
                  // Bereken gesnapte positie + tijd-label voor de drop-indicator.
                  const rect = e.currentTarget.getBoundingClientRect();
                  const yPx = e.clientY - rect.top;
                  const rawMin = yPx / PX_PER_MIN - grabOffsetRef.current;
                  const snapped = Math.round(rawMin / SNAP_MINUTES) * SNAP_MINUTES;
                  const winMin = (END_HOUR - START_HOUR) * 60;
                  const clampedInWin = Math.max(0, Math.min(winMin - SNAP_MINUTES, snapped));
                  const totalMin = START_HOUR * 60 + clampedInWin;

                  // Pre-validatie: werkuren/pauze + conflict-overlap met andere
                  // bookings van de doel-medewerker. Server blijft autoritair.
                  let invalid = false;
                  let reason: string | undefined;
                  // Bepaal duur van de gesleepte booking via gecachte id.
                  const draggedId = draggedIdRef.current;
                  const src = draggedId ? bookings.find((bk) => bk.id === draggedId) : null;
                  const durMs = src
                    ? +new Date(src.ends_at) - +new Date(src.starts_at)
                    : SNAP_MINUTES * 60_000;
                  const slotStart = new Date(dayStart);
                  slotStart.setUTCMinutes(totalMin);
                  const slotEnd = new Date(slotStart.getTime() + durMs);

                  if (dropInvalidLabels) {
                    // 1) Conflict-check tegen andere bookings van doel-medewerker.
                    if (dropInvalidLabels.conflictWith && c.staffId != null && src) {
                      const newStartTs = slotStart.getTime();
                      const newEndTs = slotEnd.getTime();
                      for (const other of visibleBookings) {
                        if (other.id === src.id) continue;
                        if ((other.staff_id ?? null) !== c.staffId) continue;
                        if (other.status === "cancelled" || other.status === "no_show") continue;
                        const oStart = new Date(other.starts_at).getTime();
                        const oEnd = new Date(other.ends_at).getTime();
                        if (newStartTs < oEnd && newEndTs > oStart) {
                          const oStartDate = new Date(other.starts_at);
                          const oEndDate = new Date(other.ends_at);
                          const oStartMin =
                            oStartDate.getUTCHours() * 60 + oStartDate.getUTCMinutes();
                          const oEndMin =
                            oEndDate.getUTCHours() * 60 + oEndDate.getUTCMinutes();
                          invalid = true;
                          reason = dropInvalidLabels.conflictWith(
                            `${formatMinutes(oStartMin)}–${formatMinutes(oEndMin)}`,
                          );
                          break;
                        }
                      }
                    }
                    // 2) Werkuren/pauze van doel-medewerker (alleen als nog geen conflict).
                    if (!invalid && c.workingHours) {
                      const v = validateBookingSlot(slotStart, slotEnd, c.workingHours);
                      if (v.kind === "closed_day") {
                        invalid = true;
                        reason = dropInvalidLabels.closedDay;
                      } else if (v.kind === "off_hours") {
                        invalid = true;
                        const w = v.window;
                        reason = w
                          ? dropInvalidLabels.offHours(`${formatMinutes(w.startMin)}–${formatMinutes(w.endMin)}`)
                          : dropInvalidLabels.offHours("—");
                      } else if (v.kind === "break") {
                        invalid = true;
                        const br = v.window;
                        reason = dropInvalidLabels.duringBreak(`${formatMinutes(br.startMin)}–${formatMinutes(br.endMin)}`);
                      }
                    }
                  }

                  // Browser-niveau drop-block: cursor toont "verboden", onDrop vuurt niet.
                  if (invalid) {
                    e.dataTransfer.dropEffect = "none";
                  }

                  setDragPreview({
                    colKey: c.key,
                    topPx: clampedInWin * PX_PER_MIN,
                    label: formatMinutes(totalMin),
                    invalid,
                    reason,
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
                draggedIdRef.current = null;
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
                // Pre-validatie commit-block: werkuren/pauze + conflict-overlap.
                // Server blijft autoritair, maar we voorkomen onnodige roundtrips.
                // Bij invalid: notify parent (toast) en abort. Normaal vuurt deze
                // path niet bij invalid omdat onDragOver dropEffect="none" zet, maar
                // bij touch-emulatie / oudere browsers kan dat soms toch gebeuren.
                if (dropInvalidLabels) {
                  const durMs = +new Date(booking.ends_at) - +new Date(booking.starts_at);
                  const slotEnd = new Date(newStart.getTime() + durMs);
                  // Conflict-check
                  if (c.staffId != null && dropInvalidLabels.conflictWith) {
                    const newStartTs = newStart.getTime();
                    const newEndTs = slotEnd.getTime();
                    for (const other of visibleBookings) {
                      if (other.id === booking.id) continue;
                      if ((other.staff_id ?? null) !== c.staffId) continue;
                      if (other.status === "cancelled" || other.status === "no_show") continue;
                      const oStart = new Date(other.starts_at).getTime();
                      const oEnd = new Date(other.ends_at).getTime();
                      if (newStartTs < oEnd && newEndTs > oStart) {
                        const oStartDate = new Date(other.starts_at);
                        const oEndDate = new Date(other.ends_at);
                        const oStartMin =
                          oStartDate.getUTCHours() * 60 + oStartDate.getUTCMinutes();
                        const oEndMin =
                          oEndDate.getUTCHours() * 60 + oEndDate.getUTCMinutes();
                        onDropBlocked?.(
                          dropInvalidLabels.conflictWith(
                            `${formatMinutes(oStartMin)}–${formatMinutes(oEndMin)}`,
                          ),
                        );
                        return;
                      }
                    }
                  }
                  // Werkuren/pauze
                  if (c.workingHours) {
                    const v = validateBookingSlot(newStart, slotEnd, c.workingHours);
                    if (v.kind === "closed_day") {
                      onDropBlocked?.(dropInvalidLabels.closedDay);
                      return;
                    }
                    if (v.kind === "off_hours") {
                      const w = v.window;
                      onDropBlocked?.(
                        w
                          ? dropInvalidLabels.offHours(`${formatMinutes(w.startMin)}–${formatMinutes(w.endMin)}`)
                          : dropInvalidLabels.offHours("—"),
                      );
                      return;
                    }
                    if (v.kind === "break") {
                      const br = v.window;
                      onDropBlocked?.(
                        dropInvalidLabels.duringBreak(`${formatMinutes(br.startMin)}–${formatMinutes(br.endMin)}`),
                      );
                      return;
                    }
                  }
                }
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

              {/* Drop-indicator: gesnapte horizontale lijn met tijd-label tijdens drag.
                  Rood (destructive) wanneer de positie buiten werkuren of in pauze valt. */}
              {dragPreview && dragPreview.colKey === c.key && (
                <div
                  className={cn(
                    "pointer-events-none absolute left-0 right-0 z-[15] border-t-2 border-dashed",
                    dragPreview.invalid ? "border-destructive" : "border-primary",
                  )}
                  style={{ top: dragPreview.topPx }}
                  title={dragPreview.reason}
                >
                  <span
                    className={cn(
                      "absolute -top-2.5 left-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums shadow-soft",
                      dragPreview.invalid
                        ? "bg-destructive text-destructive-foreground"
                        : "bg-primary text-primary-foreground",
                    )}
                  >
                    {dragPreview.label}
                    {dragPreview.invalid && dragPreview.reason ? ` · ${dragPreview.reason}` : ""}
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
                        data-booking-id={b.id}
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
                          // Cache booking-id voor pre-validatie tijdens dragOver
                          // (waar dataTransfer.getData niet leesbaar is).
                          draggedIdRef.current = b.id;
                          e.dataTransfer.setData("application/x-grab-offset-min", String(grabMin));
                        } : undefined}
                        onDragEnd={() => {
                          draggedIdRef.current = null;
                          setDragPreview(null);
                        }}
                        onTouchStart={draggable ? (e) => {
                          // Touch long-press → drag flow voor iPad/tablet in salons.
                          // Native HTML5 drag werkt niet op touch, dus we doen het zelf.
                          if (e.touches.length !== 1) return;
                          const touch = e.touches[0];
                          const startX = touch.clientX;
                          const startY = touch.clientY;
                          const blockRect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                          const grabPx = touch.clientY - blockRect.top;
                          const grabMin = Math.max(0, grabPx / PX_PER_MIN);

                          let activated = false;
                          let cancelled = false;
                          const LONG_PRESS_MS = 400;
                          const MOVE_TOLERANCE_PX = 8;
                          // Auto-scroll bij rand: scrollt het grid wanneer de vinger binnen
                          // 60px van de boven-/onderrand komt — anders zijn lange dagen
                          // (bv. 08:00–22:00) onbereikbaar buiten het zichtbare venster
                          // op tablet/iPad. Pas geactiveerd na long-press.
                          const autoScroller = createEdgeAutoScroller(e.currentTarget as HTMLElement);

                          const cleanup = () => {
                            window.removeEventListener("touchmove", onMove);
                            window.removeEventListener("touchend", onEnd);
                            window.removeEventListener("touchcancel", onCancel);
                            clearTimeout(longPressTimer);
                            autoScroller.stop();
                          };

                          const computeAt = (clientX: number, clientY: number) => {
                            const el = document.elementFromPoint(clientX, clientY);
                            const colEl = el?.closest("[data-col-key]") as HTMLElement | null;
                            if (!colEl) return null;
                            const colKey = colEl.getAttribute("data-col-key");
                            if (!colKey) return null;
                            const targetCol = columns.find((cc) => cc.key === colKey);
                            if (!targetCol) return null;
                            const rect = colEl.getBoundingClientRect();
                            const yPx = clientY - rect.top;
                            const rawMin = yPx / PX_PER_MIN - grabMin;
                            const snapped = Math.round(rawMin / SNAP_MINUTES) * SNAP_MINUTES;
                            const winMin = (END_HOUR - START_HOUR) * 60;
                            const clampedInWin = Math.max(0, Math.min(winMin - SNAP_MINUTES, snapped));
                            const totalMin = START_HOUR * 60 + clampedInWin;
                            return { targetCol, clampedInWin, totalMin };
                          };

                          // Gedeelde validatie: werkuren/pauze van doel-kolom +
                          // conflict-overlap met andere bookings van doel-medewerker.
                          const computeValidation = (
                            targetCol: typeof columns[number],
                            slotStart: Date,
                            slotEnd: Date,
                          ): { invalid: boolean; reason?: string } => {
                            if (!dropInvalidLabels) return { invalid: false };
                            // 1) Conflict-check
                            if (dropInvalidLabels.conflictWith && targetCol.staffId != null) {
                              const newStartTs = slotStart.getTime();
                              const newEndTs = slotEnd.getTime();
                              for (const other of visibleBookings) {
                                if (other.id === b.id) continue;
                                if ((other.staff_id ?? null) !== targetCol.staffId) continue;
                                if (other.status === "cancelled" || other.status === "no_show") continue;
                                const oStart = new Date(other.starts_at).getTime();
                                const oEnd = new Date(other.ends_at).getTime();
                                if (newStartTs < oEnd && newEndTs > oStart) {
                                  const oStartDate = new Date(other.starts_at);
                                  const oEndDate = new Date(other.ends_at);
                                  const oStartMin =
                                    oStartDate.getUTCHours() * 60 + oStartDate.getUTCMinutes();
                                  const oEndMin =
                                    oEndDate.getUTCHours() * 60 + oEndDate.getUTCMinutes();
                                  return {
                                    invalid: true,
                                    reason: dropInvalidLabels.conflictWith(
                                      `${formatMinutes(oStartMin)}–${formatMinutes(oEndMin)}`,
                                    ),
                                  };
                                }
                              }
                            }
                            // 2) Werkuren/pauze
                            if (!targetCol.workingHours) return { invalid: false };
                            const v = validateBookingSlot(slotStart, slotEnd, targetCol.workingHours);
                            if (v.kind === "ok" || v.kind === "no_data") return { invalid: false };
                            if (v.kind === "closed_day") {
                              return { invalid: true, reason: dropInvalidLabels.closedDay };
                            }
                            if (v.kind === "off_hours") {
                              const w = v.window;
                              return {
                                invalid: true,
                                reason: w
                                  ? dropInvalidLabels.offHours(`${formatMinutes(w.startMin)}–${formatMinutes(w.endMin)}`)
                                  : dropInvalidLabels.offHours("—"),
                              };
                            }
                            if (v.kind === "break") {
                              const br = v.window;
                              return {
                                invalid: true,
                                reason: dropInvalidLabels.duringBreak(`${formatMinutes(br.startMin)}–${formatMinutes(br.endMin)}`),
                              };
                            }
                            return { invalid: false };
                          };

                          const updatePreview = (clientX: number, clientY: number) => {
                            const at = computeAt(clientX, clientY);
                            if (!at) {
                              setDragPreview(null);
                              return;
                            }
                            const { targetCol, clampedInWin, totalMin } = at;
                            const slotStart = new Date(dayStart);
                            slotStart.setUTCMinutes(totalMin);
                            const slotEnd = new Date(slotStart.getTime() + durMin * 60_000);
                            const v = computeValidation(targetCol, slotStart, slotEnd);
                            setDragPreview({
                              colKey: targetCol.key,
                              topPx: clampedInWin * PX_PER_MIN,
                              label: formatMinutes(totalMin),
                              invalid: v.invalid,
                              reason: v.reason,
                            });
                          };

                          const onMove = (ev: TouchEvent) => {
                            if (ev.touches.length !== 1) return;
                            const t = ev.touches[0];
                            if (!activated) {
                              const dx = Math.abs(t.clientX - startX);
                              const dy = Math.abs(t.clientY - startY);
                              if (dx > MOVE_TOLERANCE_PX || dy > MOVE_TOLERANCE_PX) {
                                cancelled = true;
                                cleanup();
                              }
                              return;
                            }
                            ev.preventDefault();
                            autoScroller.update(t.clientY);
                            updatePreview(t.clientX, t.clientY);
                          };

                          const onEnd = (ev: TouchEvent) => {
                            cleanup();
                            if (!activated || cancelled) {
                              setTouchDrag(null);
                              setDragPreview(null);
                              return;
                            }
                            const t = ev.changedTouches[0];
                            const at = computeAt(t.clientX, t.clientY);
                            setTouchDrag(null);
                            setDragPreview(null);
                            if (!at) return;
                            const { targetCol, totalMin } = at;
                            const slotStart = new Date(dayStart);
                            slotStart.setUTCMinutes(totalMin);
                            const slotEnd = new Date(slotStart.getTime() + durMin * 60_000);
                            // Blokkeer commit bij invalid (werkuren/pauze/conflict) + notify parent.
                            const tv = computeValidation(targetCol, slotStart, slotEnd);
                            if (tv.invalid) {
                              if (tv.reason) onDropBlocked?.(tv.reason);
                              return;
                            }
                            const newStart = new Date(dayStart);
                            newStart.setUTCHours(0, 0, 0, 0);
                            newStart.setUTCMinutes(totalMin);
                            const sameStaff = (b.staff_id ?? null) === targetCol.staffId;
                            const sameTime = new Date(b.starts_at).getTime() === newStart.getTime();
                            if (sameStaff && sameTime) return;
                            onReschedule?.({
                              booking: b,
                              newStaffId: targetCol.staffId,
                              newStartsAt: newStart,
                            });
                          };

                          const onCancel = () => {
                            cleanup();
                            setTouchDrag(null);
                            setDragPreview(null);
                          };

                          const longPressTimer = setTimeout(() => {
                            if (cancelled) return;
                            activated = true;
                            grabOffsetRef.current = grabMin;
                            setTouchDrag({ bookingId: b.id });
                            updatePreview(startX, startY);
                            if ("vibrate" in navigator) {
                              try { navigator.vibrate(15); } catch { /* noop */ }
                            }
                          }, LONG_PRESS_MS);

                          window.addEventListener("touchmove", onMove, { passive: false });
                          window.addEventListener("touchend", onEnd);
                          window.addEventListener("touchcancel", onCancel);
                        } : undefined}
                        onClick={() => {
                          if (isResizingThis) return;
                          if (touchDrag?.bookingId === b.id) return;
                          onSelectBooking?.(b);
                        }}
                        onKeyDown={draggable ? (e) => {
                          // Keyboard reschedule (a11y): ±15 min met Up/Down,
                          // medewerker-kolom wisselen met Left/Right. Dezelfde
                          // pre-validatie (werkuren / pauze / conflict) als drag-flow,
                          // dezelfde visuele feedback via dragPreview.
                          const key = e.key;
                          if (key !== "ArrowUp" && key !== "ArrowDown" && key !== "ArrowLeft" && key !== "ArrowRight") return;
                          if (e.altKey || e.ctrlKey || e.metaKey) return;
                          e.preventDefault();
                          e.stopPropagation();

                          const colIdx = columns.findIndex((cc) => cc.key === c.key);
                          let targetCol = c;
                          let newStart = new Date(b.starts_at);

                          if (key === "ArrowUp" || key === "ArrowDown") {
                            const delta = key === "ArrowUp" ? -SNAP_MINUTES : SNAP_MINUTES;
                            newStart = new Date(newStart.getTime() + delta * 60_000);
                          } else {
                            const dir = key === "ArrowLeft" ? -1 : 1;
                            const nextIdx = colIdx + dir;
                            if (nextIdx < 0 || nextIdx >= columns.length) return;
                            targetCol = columns[nextIdx];
                          }

                          // Clamp binnen het dag-venster (zelfde regels als drag).
                          const dayMinStart = START_HOUR * 60;
                          const dayMinEnd = END_HOUR * 60;
                          const startMinAbs = newStart.getUTCHours() * 60 + newStart.getUTCMinutes();
                          if (startMinAbs < dayMinStart || startMinAbs + durMin > dayMinEnd) {
                            return;
                          }

                          const slotEnd = new Date(newStart.getTime() + durMin * 60_000);

                          // Hergebruikt validatie-patroon: conflict + werkuren/pauze.
                          let invalid = false;
                          let reason: string | undefined;
                          if (dropInvalidLabels) {
                            if (dropInvalidLabels.conflictWith && targetCol.staffId != null) {
                              const newStartTs = newStart.getTime();
                              const newEndTs = slotEnd.getTime();
                              for (const other of visibleBookings) {
                                if (other.id === b.id) continue;
                                if ((other.staff_id ?? null) !== targetCol.staffId) continue;
                                if (other.status === "cancelled" || other.status === "no_show") continue;
                                const oStart = new Date(other.starts_at).getTime();
                                const oEnd = new Date(other.ends_at).getTime();
                                if (newStartTs < oEnd && newEndTs > oStart) {
                                  const oS = new Date(other.starts_at);
                                  const oE = new Date(other.ends_at);
                                  const oSm = oS.getUTCHours() * 60 + oS.getUTCMinutes();
                                  const oEm = oE.getUTCHours() * 60 + oE.getUTCMinutes();
                                  invalid = true;
                                  reason = dropInvalidLabels.conflictWith(`${formatMinutes(oSm)}–${formatMinutes(oEm)}`);
                                  break;
                                }
                              }
                            }
                            if (!invalid && targetCol.workingHours) {
                              const v = validateBookingSlot(newStart, slotEnd, targetCol.workingHours);
                              if (v.kind === "closed_day") { invalid = true; reason = dropInvalidLabels.closedDay; }
                              else if (v.kind === "off_hours") {
                                invalid = true;
                                reason = v.window
                                  ? dropInvalidLabels.offHours(`${formatMinutes(v.window.startMin)}–${formatMinutes(v.window.endMin)}`)
                                  : dropInvalidLabels.offHours("—");
                              }
                              else if (v.kind === "break") {
                                invalid = true;
                                reason = dropInvalidLabels.duringBreak(`${formatMinutes(v.window.startMin)}–${formatMinutes(v.window.endMin)}`);
                              }
                            }
                          }

                          // Visuele feedback via bestaande dragPreview-state.
                          const previewTopPx = (startMinAbs - dayMinStart) * PX_PER_MIN;
                          setDragPreview({
                            colKey: targetCol.key,
                            topPx: previewTopPx,
                            label: formatMinutes(startMinAbs),
                            invalid,
                            reason,
                          });
                          window.setTimeout(() => {
                            setDragPreview((prev) => (prev && prev.colKey === targetCol.key && prev.label === formatMinutes(startMinAbs) ? null : prev));
                          }, 800);

                          if (invalid) {
                            if (reason) onDropBlocked?.(reason);
                            return;
                          }
                          onReschedule?.({
                            booking: b,
                            newStaffId: targetCol.staffId,
                            newStartsAt: newStart,
                          });
                        } : undefined}
                        className={cn(
                          "block h-full w-full overflow-hidden rounded-lg border px-2 py-1 text-left text-[11px] shadow-soft transition-transform hover:z-20 hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                          draggable && !isResizingThis && "cursor-grab active:cursor-grabbing active:opacity-70",
                          tone
                            ? `${tone.bg} ${tone.text} border-transparent`
                            : "border-border bg-muted text-foreground",
                          isCancelled && "opacity-60 line-through decoration-1",
                          isResizingThis && "ring-2 ring-primary/60",
                          touchDrag?.bookingId === b.id && "scale-[1.02] opacity-70 ring-2 ring-primary/70",
                        )}
                        style={touchDrag?.bookingId === b.id ? { touchAction: "none" } : undefined}
                        title={`${cust?.full_name ?? "—"} · ${svc?.name ?? "—"} · ${formatTime(b.starts_at)}–${formatTime(b.ends_at)}${draggable ? " · Sleep of gebruik pijltjestoetsen om te verplaatsen" : ""}`}
                        aria-label={draggable ? `${cust?.full_name ?? "—"} · ${formatTime(b.starts_at)}–${formatTime(b.ends_at)} · Pijltjes om ±15 min of medewerker-kolom te verplaatsen` : undefined}
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
                      {/* Resize-handle: alleen wanneer reschedule beschikbaar is en booking actief is.
                          Ondersteunt zowel mouse als touch (tablet/iPad in salons) met
                          vergrote hit-area op coarse-pointer devices. */}
                      {draggable && (() => {
                        const startTopPx = top;
                        const startDurInit = durMin;
                        const winMinTotal = (END_HOUR - START_HOUR) * 60;
                        const startMinAbs = startMin;
                        const maxDur = Math.max(SNAP_MINUTES, winMinTotal - startMinAbs);
                        const wh = c.workingHours;
                        const computeValidation = (
                          newDurMin: number,
                        ): { invalid: boolean; reason?: string } => {
                          if (!dropInvalidLabels) return { invalid: false };
                          const slotEnd = new Date(start.getTime() + newDurMin * 60_000);
                          // Conflict-check: overlap met andere booking van dezelfde medewerker.
                          // Server blijft autoritair — dit is alleen UX-feedback. We negeren
                          // cancelled/no_show en de booking zelf. Half-open interval [start, end).
                          if (dropInvalidLabels.conflictWith && c.staffId != null) {
                            const newStartTs = start.getTime();
                            const newEndTs = slotEnd.getTime();
                            for (const other of visibleBookings) {
                              if (other.id === b.id) continue;
                              if ((other.staff_id ?? null) !== c.staffId) continue;
                              if (other.status === "cancelled" || other.status === "no_show") continue;
                              const oStart = new Date(other.starts_at).getTime();
                              const oEnd = new Date(other.ends_at).getTime();
                              if (newStartTs < oEnd && newEndTs > oStart) {
                                const oStartMin =
                                  new Date(other.starts_at).getUTCHours() * 60 +
                                  new Date(other.starts_at).getUTCMinutes();
                                const oEndMin =
                                  new Date(other.ends_at).getUTCHours() * 60 +
                                  new Date(other.ends_at).getUTCMinutes();
                                return {
                                  invalid: true,
                                  reason: dropInvalidLabels.conflictWith(
                                    `${formatMinutes(oStartMin)}–${formatMinutes(oEndMin)}`,
                                  ),
                                };
                              }
                            }
                          }
                          if (!wh) return { invalid: false };
                          const v = validateBookingSlot(start, slotEnd, wh);
                          if (v.kind === "ok" || v.kind === "no_data") return { invalid: false };
                          if (v.kind === "closed_day") {
                            return { invalid: true, reason: dropInvalidLabels.closedDay };
                          }
                          if (v.kind === "off_hours") {
                            const w = v.window;
                            return {
                              invalid: true,
                              reason: w
                                ? dropInvalidLabels.offHours(`${formatMinutes(w.startMin)}–${formatMinutes(w.endMin)}`)
                                : dropInvalidLabels.offHours("—"),
                            };
                          }
                          if (v.kind === "break") {
                            const br = v.window;
                            return {
                              invalid: true,
                              reason: dropInvalidLabels.duringBreak(`${formatMinutes(br.startMin)}–${formatMinutes(br.endMin)}`),
                            };
                          }
                          return { invalid: false };
                        };
                        const updateFromY = (clientY: number, startY: number) => {
                          const dy = clientY - startY;
                          const rawDur = startDurInit + dy / PX_PER_MIN;
                          const snapped = Math.round(rawDur / SNAP_MINUTES) * SNAP_MINUTES;
                          const clamped = Math.max(SNAP_MINUTES, Math.min(maxDur, snapped));
                          const endTotalMin = START_HOUR * 60 + startMinAbs + clamped;
                          const v = computeValidation(clamped);
                          setResizing({
                            bookingId: b.id,
                            colKey: c.key,
                            startTopPx,
                            newDurMin: clamped,
                            label: formatMinutes(endTotalMin),
                            invalid: v.invalid,
                            reason: v.reason,
                          });
                        };
                        const commit = () => {
                          setResizing((cur) => {
                            if (!cur || cur.bookingId !== b.id) return null;
                            if (cur.invalid) {
                              // Resize geblokkeerd door pre-validatie — toast in parent.
                              if (cur.reason) onDropBlocked?.(cur.reason);
                            } else if (
                              Math.round(cur.newDurMin) !== Math.round(startDurInit) &&
                              onReschedule
                            ) {
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
                        const seedInitial = (clientY: number) => {
                          const initial = computeValidation(startDurInit);
                          setResizing({
                            bookingId: b.id,
                            colKey: c.key,
                            startTopPx,
                            newDurMin: startDurInit,
                            label: formatMinutes(START_HOUR * 60 + startMinAbs + startDurInit),
                            invalid: initial.invalid,
                            reason: initial.reason,
                          });
                          // Niet direct updaten — wachten op eerste move event.
                          void clientY;
                        };
                        return (
                          <div
                            role="slider"
                            aria-label={resizeHandleLabel ?? "Sleep om duur aan te passen"}
                            aria-valuemin={15}
                            aria-valuenow={Math.round(liveDurMin)}
                            tabIndex={-1}
                            title={resizeHandleLabel ?? "Sleep om duur aan te passen"}
                            // touchAction:none voorkomt page-scroll tijdens vertical drag op touch.
                            style={{ touchAction: "none" }}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const startY = e.clientY;
                              const onMove = (ev: MouseEvent) => updateFromY(ev.clientY, startY);
                              const onUp = () => {
                                window.removeEventListener("mousemove", onMove);
                                window.removeEventListener("mouseup", onUp);
                                commit();
                              };
                              window.addEventListener("mousemove", onMove);
                              window.addEventListener("mouseup", onUp);
                              seedInitial(startY);
                            }}
                            onTouchStart={(e) => {
                              if (e.touches.length !== 1) return;
                              e.stopPropagation();
                              const startY = e.touches[0].clientY;
                              const onMove = (ev: TouchEvent) => {
                                if (ev.touches.length !== 1) return;
                                // preventDefault voorkomt scroll tijdens resize.
                                ev.preventDefault();
                                updateFromY(ev.touches[0].clientY, startY);
                              };
                              const onEnd = () => {
                                window.removeEventListener("touchmove", onMove);
                                window.removeEventListener("touchend", onEnd);
                                window.removeEventListener("touchcancel", onEnd);
                                commit();
                              };
                              // passive:false → preventDefault binnen onMove werkt.
                              window.addEventListener("touchmove", onMove, { passive: false });
                              window.addEventListener("touchend", onEnd);
                              window.addEventListener("touchcancel", onEnd);
                              seedInitial(startY);
                            }}
                            className={cn(
                              "absolute inset-x-0 bottom-0 z-[6] flex h-2.5 cursor-ns-resize items-center justify-center rounded-b-lg",
                              // Vergrote hit-area op coarse-pointer (touch) devices.
                              "[@media(pointer:coarse)]:h-6",
                              // Zichtbaarheid: standaard verborgen, altijd zichtbaar op
                              // coarse-pointer (geen hover op touch) of tijdens resize.
                              "opacity-0 transition-opacity hover:opacity-100",
                              "[@media(pointer:coarse)]:opacity-100",
                              isResizingThis && "opacity-100",
                            )}
                          >
                            <span className="h-1 w-8 rounded-full bg-foreground/30 [@media(pointer:coarse)]:h-1.5 [@media(pointer:coarse)]:w-10" />
                          </div>
                        );
                      })()}
                      {/* Live tijd-badge tijdens resize. Rood (destructive) wanneer de
                          nieuwe eindtijd buiten werkuren of in een pauze valt. */}
                      {isResizingThis && (
                        <span
                          className={cn(
                            "pointer-events-none absolute -bottom-2.5 right-1 z-[16] rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums shadow-soft",
                            resizing!.invalid
                              ? "bg-destructive text-destructive-foreground"
                              : "bg-primary text-primary-foreground",
                          )}
                          title={resizing!.reason}
                        >
                          {resizing!.label}
                          {resizing!.invalid && resizing!.reason ? ` · ${resizing!.reason}` : ""}
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
