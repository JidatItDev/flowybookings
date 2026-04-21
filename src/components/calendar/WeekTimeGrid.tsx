import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/format";
import { staffInitials, type StaffColor } from "@/lib/staff-color";
import type { BookingWithRelations } from "@/lib/queries";
import {
  formatMinutesOfDay,
  parseMinutes,
  validateBookingSlot,
  type BusinessHours,
  type DayKey,
  type StaffWorkingHours,
} from "@/lib/staff-availability";

/**
 * Weekrooster (5–7 dagen) als compacte salon-stijl agenda.
 *
 * - Kolommen: één per dag (UTC midnight)
 * - Rijen: uren binnen het venster (afgeleid van shop business_hours of fallback)
 * - Bookings: gepositioneerd op basis van starts_at/ends_at, gekleurd via de
 *   medewerker-kleur-dot (staff samengevouwen tot één blok per booking).
 * - Overlay: dagen waarop de salon gesloten is worden gestreept; voor open
 *   dagen tonen we off-hours buiten business_hours (consistent met DayTimeGrid).
 *
 * Pure presentatie — hergebruikt bookingsQuery-data en staff-availability
 * primitives. Geen mutaties, geen extra endpoints.
 */

const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 21;
const MIN_HOUR = 6;
const MAX_HOUR = 23;
const PX_PER_HOUR = 56;
const PX_PER_MIN = PX_PER_HOUR / 60;
const SNAP_MINUTES = 15;
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const DRAG_MIME = "application/x-flowy-booking";

type StaffLite = {
  id: string;
  full_name: string;
  is_active: boolean;
  /** Optioneel — gebruikt voor pre-validatie van de drop-positie tijdens drag. */
  working_hours?: unknown;
};

type ColorResolver = {
  get: (staffId: string | null | undefined) => StaffColor;
};

export type WeekRescheduleParams = {
  booking: BookingWithRelations;
  newStaffId: string | null;
  newStartsAt: Date;
  /** Optioneel — wanneer gezet, override van de afgeleide einde (voor resize-flow). */
  newEndsAt?: Date;
};

export type WeekTimeGridProps = {
  /** Startdag van de week (UTC midnight). Doorgaans maandag. */
  weekStart: Date;
  /** Aantal dagen om te tonen (5 = werkweek, 7 = volledige week). */
  days?: number;
  bookings: BookingWithRelations[];
  staff: StaffLite[];
  colors: ColorResolver;
  businessHours?: BusinessHours;
  onSelectBooking?: (b: BookingWithRelations) => void;
  /** Klik op een dag-header → spring naar die dag in de dag-weergave. */
  onSelectDay?: (day: Date) => void;
  /** Drag & drop reschedule. Behoudt staff_id, wijzigt alleen datum/tijd. */
  onReschedule?: (params: WeekRescheduleParams) => void;
  /** i18n-label voor de resize-handle (tooltip + aria). */
  resizeHandleLabel?: string;
  /** i18n-labels voor invalid drop-redenen (per-staff working-hours pre-validatie). */
  dropInvalidLabels?: {
    closedDay: string;
    offHours: (range: string) => string;
    duringBreak: (range: string) => string;
  };
};

function parseHour(value: string | undefined, mode: "floor" | "ceil"): number | null {
  const mins = parseMinutes(value);
  if (mins == null) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (mode === "floor") return h;
  return m > 0 ? Math.min(24, h + 1) : h;
}

/** Verzamel het uur-venster over alle dagen in de week (union van open/close). */
function resolveWeekWindow(
  days: Date[],
  bh: BusinessHours | undefined,
): { startHour: number; endHour: number } {
  let minOpen = DEFAULT_START_HOUR;
  let maxClose = DEFAULT_END_HOUR;
  if (bh) {
    let any = false;
    let lo = 24;
    let hi = 0;
    for (const d of days) {
      const dh = bh[DAY_KEYS[d.getUTCDay()] as DayKey];
      if (!dh || dh.closed) continue;
      const o = parseHour(dh.open, "floor");
      const c = parseHour(dh.close, "ceil");
      if (o == null || c == null || c <= o) continue;
      any = true;
      if (o < lo) lo = o;
      if (c > hi) hi = c;
    }
    if (any) {
      minOpen = lo;
      maxClose = hi;
    }
  }
  const startHour = Math.max(MIN_HOUR, Math.min(MAX_HOUR - 4, minOpen));
  const endHour = Math.min(MAX_HOUR, Math.max(startHour + 4, maxClose));
  return { startHour, endHour };
}

function dayWindow(d: Date, bh: BusinessHours | undefined): { open: number; close: number; closed: boolean } | null {
  if (!bh) return null;
  const dh = bh[DAY_KEYS[d.getUTCDay()] as DayKey];
  if (!dh) return null;
  if (dh.closed) return { open: 0, close: 0, closed: true };
  const o = parseHour(dh.open, "floor");
  const c = parseHour(dh.close, "ceil");
  if (o == null || c == null || c <= o) return null;
  return { open: o * 60, close: c * 60, closed: false };
}

export function WeekTimeGrid({
  weekStart,
  days = 7,
  bookings,
  staff,
  colors,
  businessHours,
  onSelectBooking,
  onSelectDay,
  onReschedule,
  resizeHandleLabel,
  dropInvalidLabels,
}: WeekTimeGridProps) {
  const bookingsById = useMemo(() => {
    const m = new Map<string, BookingWithRelations>();
    for (const b of bookings) m.set(b.id, b);
    return m;
  }, [bookings]);
  const dayList = useMemo(() => {
    const start = new Date(weekStart);
    start.setUTCHours(0, 0, 0, 0);
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i);
      return d;
    });
  }, [weekStart, days]);

  const { startHour: START_HOUR, endHour: END_HOUR } = useMemo(
    () => resolveWeekWindow(dayList, businessHours),
    [dayList, businessHours],
  );

  const hours = useMemo(() => {
    const arr: number[] = [];
    for (let h = START_HOUR; h <= END_HOUR; h += 1) arr.push(h);
    return arr;
  }, [START_HOUR, END_HOUR]);

  const totalHeight = (END_HOUR - START_HOUR) * PX_PER_HOUR;
  const winStart = START_HOUR * 60;
  const winEnd = END_HOUR * 60;

  // Snelle lookup: bookings per dag-key (YYYY-M-D in UTC).
  const bookingsByDay = useMemo(() => {
    const map = new Map<string, BookingWithRelations[]>();
    for (const b of bookings) {
      const d = new Date(b.starts_at);
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
      const list = map.get(key) ?? [];
      list.push(b);
      map.set(key, list);
    }
    return map;
  }, [bookings]);

  const staffById = useMemo(() => {
    const m = new Map<string, StaffLite>();
    for (const s of staff) m.set(s.id, s);
    return m;
  }, [staff]);

  // Drag-preview: gesnapte drop-positie binnen één dag-kolom (tijdelijke UI-state).
  const grabOffsetRef = useRef<number>(0);
  // Booking-id van het actief gesleepte blok (in dragover is dataTransfer.getData
  // niet leesbaar — we cachen het hier vanuit onDragStart voor pre-validatie).
  const draggedIdRef = useRef<string | null>(null);
  const [dragPreview, setDragPreview] = useState<
    { dayKey: string; topPx: number; label: string; invalid?: boolean; reason?: string } | null
  >(null);

  const now = new Date();
  const todayKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`;
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes() - winStart;
  const nowTop = nowMinutes >= 0 && nowMinutes <= (END_HOUR - START_HOUR) * 60 ? nowMinutes * PX_PER_MIN : null;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
      <div className="overflow-x-auto">
        <div
          className="grid min-w-[720px]"
          style={{ gridTemplateColumns: `56px repeat(${dayList.length}, minmax(120px, 1fr))` }}
        >
          {/* Header rij */}
          <div className="sticky top-0 z-10 border-b border-border bg-muted/40 px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Tijd
          </div>
          {dayList.map((d) => {
            const isToday =
              `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}` === todayKey;
            const dw = dayWindow(d, businessHours);
            const closed = dw?.closed ?? false;
            return (
              <button
                key={`h-${d.toISOString()}`}
                type="button"
                onClick={() => onSelectDay?.(d)}
                className={cn(
                  "sticky top-0 z-10 flex flex-col items-center gap-0.5 border-b border-l border-border bg-muted/40 px-2 py-2 text-center transition-colors hover:bg-muted",
                  isToday && "bg-primary/10 hover:bg-primary/15",
                )}
                title="Open dag-weergave"
              >
                <span className={cn("text-[10px] font-semibold uppercase tracking-wider", isToday ? "text-primary" : "text-muted-foreground")}>
                  {d.toLocaleDateString("nl-NL", { weekday: "short", timeZone: "UTC" })}
                </span>
                <span className={cn("text-sm font-semibold tabular-nums", isToday && "text-primary")}>
                  {d.toLocaleDateString("nl-NL", { day: "2-digit", month: "short", timeZone: "UTC" })}
                </span>
                {closed && (
                  <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground/70">
                    Gesloten
                  </span>
                )}
              </button>
            );
          })}

          {/* Tijd-kolom */}
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

          {/* Dag-kolommen */}
          {dayList.map((d) => {
            const dayKey = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
            const isToday = dayKey === todayKey;
            const dw = dayWindow(d, businessHours);
            const dayStartTs = d.getTime();
            const dayEndTs = dayStartTs + 24 * 3600 * 1000;
            const dayBookings = bookingsByDay.get(dayKey) ?? [];

            // Off-hours ranges binnen het venster (wat NIET binnen open/close valt).
            const offRanges: Array<{ startMin: number; endMin: number }> = [];
            if (dw && !dw.closed) {
              if (dw.open > winStart) offRanges.push({ startMin: winStart, endMin: Math.min(dw.open, winEnd) });
              if (dw.close < winEnd) offRanges.push({ startMin: Math.max(dw.close, winStart), endMin: winEnd });
            }
            const fullClosed = dw?.closed ?? false;

            return (
              <div
                key={`col-${dayKey}`}
                className="relative border-l border-border"
                style={{ height: totalHeight }}
                onDragOver={(e) => {
                  if (!onReschedule) return;
                  if (!Array.from(e.dataTransfer.types).includes(DRAG_MIME)) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  // Bereken gesnapte positie + tijd-label voor de drop-indicator.
                  const rect = e.currentTarget.getBoundingClientRect();
                  const yPx = e.clientY - rect.top;
                  const rawMin = yPx / PX_PER_MIN - grabOffsetRef.current;
                  const snapped = Math.round(rawMin / SNAP_MINUTES) * SNAP_MINUTES;
                  const winSize = winEnd - winStart;
                  const clampedInWin = Math.max(0, Math.min(winSize - SNAP_MINUTES, snapped));
                  const totalMin = winStart + clampedInWin;

                  // Pre-validatie tegen working_hours van de booking-eigenaar
                  // (booking.staff_id wijzigt niet in week-view, alleen tijd/datum).
                  let invalid = false;
                  let reason: string | undefined;
                  const draggedId = draggedIdRef.current;
                  if (draggedId && dropInvalidLabels) {
                    const src = bookingsById.get(draggedId);
                    const stf = src?.staff_id ? staffById.get(src.staff_id) : undefined;
                    const wh = stf?.working_hours as StaffWorkingHours | undefined;
                    if (src && wh) {
                      const durMs = +new Date(src.ends_at) - +new Date(src.starts_at);
                      const slotStart = new Date(d);
                      slotStart.setUTCMinutes(totalMin);
                      const slotEnd = new Date(slotStart.getTime() + durMs);
                      const v = validateBookingSlot(slotStart, slotEnd, wh);
                      if (v.kind === "closed_day") {
                        invalid = true;
                        reason = dropInvalidLabels.closedDay;
                      } else if (v.kind === "off_hours") {
                        invalid = true;
                        const w = v.window;
                        reason = w
                          ? dropInvalidLabels.offHours(`${formatMinutesOfDay(w.startMin)}–${formatMinutesOfDay(w.endMin)}`)
                          : dropInvalidLabels.offHours("—");
                      } else if (v.kind === "break") {
                        invalid = true;
                        const br = v.window;
                        reason = dropInvalidLabels.duringBreak(`${formatMinutesOfDay(br.startMin)}–${formatMinutesOfDay(br.endMin)}`);
                      }
                    }
                  }

                  setDragPreview({
                    dayKey,
                    topPx: clampedInWin * PX_PER_MIN,
                    label: formatMinutesOfDay(totalMin),
                    invalid,
                    reason,
                  });
                }}
                onDragLeave={(e) => {
                  if (!onReschedule) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  if (
                    e.clientX < rect.left ||
                    e.clientX > rect.right ||
                    e.clientY < rect.top ||
                    e.clientY > rect.bottom
                  ) {
                    setDragPreview((prev) => (prev?.dayKey === dayKey ? null : prev));
                  }
                }}
                onDrop={(e) => {
                  if (!onReschedule) return;
                  const raw = e.dataTransfer.getData(DRAG_MIME);
                  if (!raw) return;
                  e.preventDefault();
                  setDragPreview(null);
                  draggedIdRef.current = null;
                  let payload: { id: string; grabOffsetMin: number };
                  try {
                    payload = JSON.parse(raw);
                  } catch {
                    return;
                  }
                  const src = bookingsById.get(payload.id);
                  if (!src) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const yPx = e.clientY - rect.top;
                  const rawMin = yPx / PX_PER_MIN - (payload.grabOffsetMin ?? 0);
                  const snapped = Math.round(rawMin / SNAP_MINUTES) * SNAP_MINUTES;
                  const totalMinFromMidnight = winStart + snapped;
                  const clamped = Math.max(0, Math.min(24 * 60 - SNAP_MINUTES, totalMinFromMidnight));
                  const newStart = new Date(d);
                  newStart.setUTCMinutes(clamped);
                  if (newStart.getTime() === new Date(src.starts_at).getTime()) return;
                  onReschedule({ booking: src, newStaffId: src.staff_id ?? null, newStartsAt: newStart });
                }}
              >
                {/* Hele dag gesloten */}
                {fullClosed && (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-[1] bg-muted/40"
                    style={{
                      top: 0,
                      height: totalHeight,
                      backgroundImage:
                        "repeating-linear-gradient(45deg, transparent 0 6px, hsl(var(--muted-foreground) / 0.08) 6px 7px)",
                    }}
                    title="Salon gesloten"
                  />
                )}
                {/* Off-hours blokken */}
                {!fullClosed && offRanges.map((r, i) => (
                  <div
                    key={`off-${dayKey}-${i}`}
                    className="pointer-events-none absolute inset-x-0 z-[1] bg-muted/30"
                    style={{
                      top: (r.startMin - winStart) * PX_PER_MIN,
                      height: (r.endMin - r.startMin) * PX_PER_MIN,
                      backgroundImage:
                        "repeating-linear-gradient(45deg, transparent 0 6px, hsl(var(--muted-foreground) / 0.07) 6px 7px)",
                    }}
                  />
                ))}
                {/* Uur-grid lijnen */}
                {hours.slice(0, -1).map((h, i) => (
                  <div
                    key={`grid-${dayKey}-${h}`}
                    className="absolute left-0 right-0 z-[2] border-t border-dashed border-border/60"
                    style={{ top: i * PX_PER_HOUR, height: PX_PER_HOUR }}
                  />
                ))}
                {/* Now-lijn */}
                {isToday && nowTop !== null && (
                  <div
                    className="pointer-events-none absolute left-0 right-0 z-[5] flex items-center"
                    style={{ top: nowTop }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    <span className="h-px flex-1 bg-primary" />
                  </div>
                )}
                {/* Drop-indicator: gesnapte horizontale lijn met tijd-label tijdens drag.
                    Rood (destructive) wanneer de positie buiten werkuren of in pauze valt. */}
                {dragPreview && dragPreview.dayKey === dayKey && (
                  <div
                    className={cn(
                      "pointer-events-none absolute left-0 right-0 z-[8] border-t-2 border-dashed",
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
                {/* Bookings */}
                {dayBookings.map((b) => {
                  const start = new Date(b.starts_at);
                  const end = new Date(b.ends_at);
                  const startTs = start.getTime();
                  const endTs = end.getTime();
                  if (endTs <= dayStartTs || startTs >= dayEndTs) return null;
                  const startMin = Math.max(
                    winStart,
                    start.getUTCHours() * 60 + start.getUTCMinutes(),
                  );
                  const endMinRaw =
                    endTs > dayEndTs ? 24 * 60 : end.getUTCHours() * 60 + end.getUTCMinutes();
                  const endMin = Math.min(winEnd, endMinRaw);
                  if (endMin <= startMin) return null;
                  const top = (startMin - winStart) * PX_PER_MIN;
                  const height = Math.max(20, (endMin - startMin) * PX_PER_MIN - 2);
                  const stf = b.staff_id ? staffById.get(b.staff_id) : undefined;
                  const c = colors.get(b.staff_id);
                  const cancelled = b.status === "cancelled" || b.status === "no_show";
                  const draggable = !!onReschedule && !cancelled;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => onSelectBooking?.(b)}
                      draggable={draggable}
                      onDragStart={(e) => {
                        if (!draggable) return;
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        const grabOffsetPx = e.clientY - rect.top;
                        const grabOffsetMin = grabOffsetPx / PX_PER_MIN;
                        grabOffsetRef.current = grabOffsetMin;
                        draggedIdRef.current = b.id;
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData(
                          DRAG_MIME,
                          JSON.stringify({ id: b.id, grabOffsetMin }),
                        );
                      }}
                      onDragEnd={() => {
                        draggedIdRef.current = null;
                        setDragPreview(null);
                      }}
                      className={cn(
                        "group absolute left-1 right-1 z-[4] overflow-hidden rounded-md border px-1.5 py-1 text-left text-[11px] shadow-sm transition-all hover:z-[6] hover:shadow-md",
                        draggable && "cursor-grab active:cursor-grabbing",
                        cancelled
                          ? "border-dashed border-border bg-muted/60 text-muted-foreground line-through"
                          : `border-transparent ${c.bg} ${c.text}`,
                      )}
                      style={{ top, height }}
                      title={`${formatTime(b.starts_at)} — ${stf?.full_name ?? "Niet toegewezen"}`}
                    >
                      <div className="flex items-center gap-1">
                        <span
                          className={cn(
                            "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[8px] font-bold",
                            cancelled ? "bg-muted-foreground/20 text-muted-foreground" : c.dot,
                          )}
                        >
                          {stf ? staffInitials(stf.full_name) : "—"}
                        </span>
                        <span className="truncate text-[10px] font-semibold tabular-nums">
                          {formatTime(b.starts_at)}
                        </span>
                      </div>
                      {height > 32 && (
                        <div className="mt-0.5 truncate text-[10px] opacity-90">
                          {stf?.full_name ?? "Niet toegewezen"}
                        </div>
                      )}
                    </button>
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
