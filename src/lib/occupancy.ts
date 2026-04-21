// Occupancy helpers: pure derived data from bookings + staff.working_hours.
// Reuses resolveStaffAvailability — single source of truth for working hours.

import { resolveStaffAvailability, type StaffWorkingHours } from "@/lib/staff-availability";

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

/** Sum of (working - breaks) minutes for one staff member on a given UTC day. */
export function staffAvailableMinutesOn(day: Date, wh: StaffWorkingHours | undefined): number {
  if (!wh) return 0;
  const av = resolveStaffAvailability(day, wh);
  if (!av.hasStructuredData || av.dayClosed) return 0;
  const work = av.working.reduce((a, w) => a + (w.endMin - w.startMin), 0);
  const breaks = av.breaks.reduce((a, w) => a + (w.endMin - w.startMin), 0);
  return Math.max(0, work - breaks);
}

/** Sum of booked minutes for one staff member intersecting the given UTC day. */
export function staffBookedMinutesOn(
  day: Date,
  bookings: BookingLite[],
  staffId: string | null,
): number {
  const dayStart = day.getTime();
  const dayEnd = dayStart + 86400000;
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

/** Whole-shop occupancy on a UTC day, summed over all active staff. */
export function shopDayOccupancy(
  day: Date,
  staff: StaffLite[],
  bookings: BookingLite[],
): { pct: number; bookedMin: number; availableMin: number } {
  let available = 0;
  let booked = 0;
  for (const s of staff) {
    if (!s.is_active) continue;
    const wh = (s.working_hours ?? undefined) as StaffWorkingHours | undefined;
    available += staffAvailableMinutesOn(day, wh);
    booked += staffBookedMinutesOn(day, bookings, s.id);
  }
  const pct = available > 0 ? Math.min(100, Math.round((booked / available) * 100)) : 0;
  return { pct, bookedMin: booked, availableMin: available };
}

/** Single-staff occupancy on a UTC day. */
export function staffDayOccupancy(
  day: Date,
  staff: StaffLite,
  bookings: BookingLite[],
): { pct: number; bookedMin: number; availableMin: number } {
  const wh = (staff.working_hours ?? undefined) as StaffWorkingHours | undefined;
  const available = staffAvailableMinutesOn(day, wh);
  const booked = staffBookedMinutesOn(day, bookings, staff.id);
  const pct = available > 0 ? Math.min(100, Math.round((booked / available) * 100)) : 0;
  return { pct, bookedMin: booked, availableMin: available };
}
