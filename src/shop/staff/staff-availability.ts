/**
 * Shared staff working-hours / availability primitives.
 *
 * Single source of truth for parsing `staff.working_hours` JSON and deciding
 * whether a given moment falls inside working hours, a break, or a closed day.
 *
 * Used by:
 *  - `DayTimeGrid` (visual overlay of unavailable zones)
 *  - `BookingFormDialog` (client-side pre-validation before insert)
 *  - Public booking slot intersection
 *
 * The DB trigger remains the source of truth — these helpers only avoid
 * unnecessary round-trips and surface a friendly warning to the user.
 *
 * Minutes-of-day and weekday are evaluated in **shop local time** via
 * `@/shared/lib/shop-timezone` (date-fns-tz). Do not use getUTCHours / UTC-noon tricks.
 */

import {
  DEFAULT_SHOP_TIMEZONE,
  civilDateYmd,
  dayKeyFromYmd,
  utcToShopLocal,
} from "@/shared/lib/shop-timezone";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export type DayHours = { open?: string; close?: string; closed?: boolean };
export type BusinessHours = Partial<Record<DayKey, DayHours>>;

/** Same defaults shown in Shop Settings — persisted on shop create. */
export const DEFAULT_SHOP_BUSINESS_HOURS: Record<
  DayKey,
  { open: string; close: string; closed: boolean }
> = {
  mon: { open: "09:00", close: "18:00", closed: false },
  tue: { open: "09:00", close: "18:00", closed: false },
  wed: { open: "09:00", close: "18:00", closed: false },
  thu: { open: "09:00", close: "18:00", closed: false },
  fri: { open: "09:00", close: "18:00", closed: false },
  sat: { open: "10:00", close: "16:00", closed: false },
  sun: { open: "10:00", close: "16:00", closed: true },
};

/** Per-staff per-day hours, optionally with breaks. */
export type StaffDayHours = DayHours & { breaks?: Array<{ start?: string; end?: string }> };
export type StaffWorkingHours = Partial<Record<DayKey, StaffDayHours>> & {
  /** Legacy free-text field — ignored by structured logic, kept for backwards compat. */
  hours?: string;
};

export type AvailabilityWindow = { startMin: number; endMin: number };
export type StaffAvailability = {
  working: AvailabilityWindow[];
  breaks: AvailabilityWindow[];
  dayClosed: boolean;
  hasStructuredData: boolean;
};

/** "HH:MM" → minutes since midnight. Returns null on invalid input. */
export function parseMinutes(value: string | undefined): number | null {
  if (!value) return null;
  const [hStr, mStr] = value.split(":");
  const h = Number(hStr);
  const m = Number(mStr ?? "0");
  if (!Number.isFinite(h) || h < 0 || h > 23) return null;
  if (!Number.isFinite(m) || m < 0 || m > 59) return null;
  return h * 60 + m;
}

/** Minutes since midnight → "HH:MM". */
export function formatMinutesOfDay(mins: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, Math.round(mins)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** @deprecated Prefer dayKeyFromYmd / resolveStaffAvailabilityForDayKey */
export function dayKeyForUtcDate(d: Date): DayKey {
  return dayKeyFromYmd(civilDateYmd(d));
}

/**
 * Compute structured availability for one weekday key, clamped to the optional
 * [windowStartMin, windowEndMin] view-window (shop-local minutes).
 */
export function resolveStaffAvailabilityForDayKey(
  dayKey: DayKey,
  wh: StaffWorkingHours | undefined,
  windowStartMin = 0,
  windowEndMin = 24 * 60,
): StaffAvailability {
  const empty: StaffAvailability = {
    working: [],
    breaks: [],
    dayClosed: false,
    hasStructuredData: false,
  };
  if (!wh) return empty;
  const dh = wh[dayKey];
  if (!dh) return empty; // no per-day data → treat as no overlay (legacy)
  if (dh.closed) {
    return { working: [], breaks: [], dayClosed: true, hasStructuredData: true };
  }
  const open = parseMinutes(dh.open);
  const close = parseMinutes(dh.close);
  if (open == null || close == null || close <= open) return empty;
  const ws = Math.max(windowStartMin, open);
  const we = Math.min(windowEndMin, close);
  const working: AvailabilityWindow[] = we > ws ? [{ startMin: ws, endMin: we }] : [];
  const breaks: AvailabilityWindow[] = [];
  for (const br of dh.breaks ?? []) {
    const bs = parseMinutes(br.start);
    const be = parseMinutes(br.end);
    if (bs == null || be == null || be <= bs) continue;
    const cs = Math.max(ws, bs);
    const ce = Math.min(we, be);
    if (ce > cs) breaks.push({ startMin: cs, endMin: ce });
  }
  return { working, breaks, dayClosed: false, hasStructuredData: true };
}

/**
 * Compute structured availability for one staff member on a specific civil day.
 * When `timeZone` is set, the day's weekday is taken from that zone; otherwise
 * from the Date's local civil Y-M-D (owner calendar).
 */
export function resolveStaffAvailability(
  day: Date,
  wh: StaffWorkingHours | undefined,
  windowStartMin = 0,
  windowEndMin = 24 * 60,
  timeZone?: string | null,
): StaffAvailability {
  const ymd = timeZone
    ? utcToShopLocal(day, timeZone).dateYmd
    : civilDateYmd(day);
  return resolveStaffAvailabilityForDayKey(
    dayKeyFromYmd(ymd) as DayKey,
    wh,
    windowStartMin,
    windowEndMin,
  );
}

export type SlotValidation =
  | { kind: "ok" }
  | { kind: "no_data" } // no structured working_hours → defer to server
  | { kind: "closed_day" }
  | { kind: "off_hours"; window?: AvailabilityWindow }
  | { kind: "break"; window: AvailabilityWindow };

/**
 * Validate a [startsAt, endsAt) UTC interval against a staff member's working hours
 * interpreted in the shop timezone (defaults to Europe/Amsterdam).
 */
export function validateBookingSlot(
  startsAt: Date,
  endsAt: Date,
  workingHours: StaffWorkingHours | undefined,
  timeZone: string | null | undefined = DEFAULT_SHOP_TIMEZONE,
): SlotValidation {
  if (!workingHours) return { kind: "no_data" };
  const start = utcToShopLocal(startsAt, timeZone);
  const end = utcToShopLocal(endsAt, timeZone);
  const av = resolveStaffAvailabilityForDayKey(start.dayKey as DayKey, workingHours);
  if (!av.hasStructuredData) return { kind: "no_data" };
  if (av.dayClosed) return { kind: "closed_day" };

  const startMin = start.minutesOfDay;
  const sameDay = start.dateYmd === end.dateYmd;
  const endMin = sameDay ? end.minutesOfDay : 24 * 60;

  for (const br of av.breaks) {
    if (startMin < br.endMin && endMin > br.startMin) {
      return { kind: "break", window: br };
    }
  }
  const inside = av.working.some((w) => startMin >= w.startMin && endMin <= w.endMin);
  if (!inside) {
    return { kind: "off_hours", window: av.working[0] };
  }
  return { kind: "ok" };
}
