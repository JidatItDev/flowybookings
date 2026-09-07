// Occupancy helpers: pure derived data from bookings + staff.working_hours.
// Reuses resolveStaffAvailability — single source of truth for working hours.
//
// `day` is always a shop-local calendar day, identified by a UTC instant that
// falls within it (typically shop-local midnight) — pass `shopTz` so the
// day-of-week lookup and the day's UTC bounds are both resolved against the
// shop's own wall clock rather than the browser's or a flat UTC day.

import { resolveStaffAvailability, type StaffWorkingHours } from "@/shop/staff/staff-availability";
import { shopLocalDayBoundsUtc, utcToShopLocal } from "@/shared/lib/shop-timezone";

type StaffLite = {
  id: string;
  is_active: boolean;
  working_hours: unknown;
};

type BookingLite = {
  starts_at: string;
  ends_at: string;
  status: string;
  staff_id: string | null;
};

/** Sum of (working - breaks) minutes for one staff member on a given shop-local day. */
export function staffAvailableMinutesOn(
  day: Date,
  wh: StaffWorkingHours | undefined,
  shopTz?: string | null,
): number {
  if (!wh) return 0;
  const av = resolveStaffAvailability(day, wh, 0, 24 * 60, shopTz);
  if (!av.hasStructuredData || av.dayClosed) return 0;
  const work = av.working.reduce((a, w) => a + (w.endMin - w.startMin), 0);
  const breaks = av.breaks.reduce((a, w) => a + (w.endMin - w.startMin), 0);
  return Math.max(0, work - breaks);
}

/** Sum of booked minutes for one staff member intersecting the given shop-local day. */
export function staffBookedMinutesOn(
  day: Date,
  bookings: BookingLite[],
  staffId: string | null,
  shopTz?: string | null,
): number {
  // Resolve the day's true UTC bounds via the shop's own timezone (correct even
  // on a DST-transition day, unlike assuming a flat 24h window from `day`).
  const { rangeStart, rangeEnd } = shopTz
    ? shopLocalDayBoundsUtc(utcToShopLocal(day, shopTz).dateYmd, shopTz)
    : { rangeStart: day, rangeEnd: new Date(day.getTime() + 86400000 - 1) };
  const dayStart = rangeStart.getTime();
  const dayEnd = rangeEnd.getTime() + 1;
  let booked = 0;
  for (const b of bookings) {
    if (b.status === "cancelled" || b.status === "no_show") continue;
    if (staffId !== null && b.staff_id !== staffId) continue;
    const start = new Date(b.starts_at).getTime();
    const end = new Date(b.ends_at).getTime();
    if (end <= dayStart || start >= dayEnd) continue;
    const overlap = Math.min(end, dayEnd) - Math.max(start, dayStart);
    if (overlap > 0) booked += Math.round(overlap / 60000);
  }
  return booked;
}

/** Whole-shop occupancy on a shop-local day, summed over all active staff. */
export function shopDayOccupancy(
  day: Date,
  staff: StaffLite[],
  bookings: BookingLite[],
  shopTz?: string | null,
): { pct: number; bookedMin: number; availableMin: number } {
  let available = 0;
  let booked = 0;
  for (const s of staff) {
    if (!s.is_active) continue;
    const wh = (s.working_hours ?? undefined) as StaffWorkingHours | undefined;
    available += staffAvailableMinutesOn(day, wh, shopTz);
    booked += staffBookedMinutesOn(day, bookings, s.id, shopTz);
  }
  const pct = available > 0 ? Math.min(100, Math.round((booked / available) * 100)) : 0;
  return { pct, bookedMin: booked, availableMin: available };
}

/** Single-staff occupancy on a shop-local day. */
export function staffDayOccupancy(
  day: Date,
  staff: StaffLite,
  bookings: BookingLite[],
  shopTz?: string | null,
): { pct: number; bookedMin: number; availableMin: number } {
  const wh = (staff.working_hours ?? undefined) as StaffWorkingHours | undefined;
  const available = staffAvailableMinutesOn(day, wh, shopTz);
  const booked = staffBookedMinutesOn(day, bookings, staff.id, shopTz);
  const pct = available > 0 ? Math.min(100, Math.round((booked / available) * 100)) : 0;
  return { pct, bookedMin: booked, availableMin: available };
}
