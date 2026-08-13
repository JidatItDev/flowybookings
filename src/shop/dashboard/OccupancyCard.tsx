// Occupancy card: % of booked vs available staff time over the last 7 days.
// Reuses staff.working_hours via resolveStaffAvailability — no new logic.

import { useMemo } from "react";
import { Gauge } from "lucide-react";
import { useT } from "@/shared/lib/i18n";
import { resolveStaffAvailability, type StaffWorkingHours } from "@/shop/staff/staff-availability";
import type { BookingWithRelations } from "@/shop/shared/queries-barrel";

type StaffLite = {
  id: string;
  full_name: string;
  is_active: boolean;
  working_hours: unknown;
};

interface Props {
  bookings: BookingWithRelations[];
  staff: StaffLite[];
}

export function OccupancyCard({ bookings, staff }: Props) {
  const { t } = useT();

  const { pct, bookedMin, availableMin, perDay } = useMemo(() => {
    // Window: last 7 completed days including today (UTC).
    const days: Date[] = [];
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      days.push(d);
    }

    const activeStaff = staff.filter((s) => s.is_active);

    let totalAvailable = 0;
    let totalBooked = 0;
    const perDay: { day: string; pct: number }[] = [];

    for (const day of days) {
      const dayStart = day.getTime();
      const dayEnd = dayStart + 86400000;

      // Sum available minutes across active staff (working hours minus breaks).
      let available = 0;
      for (const s of activeStaff) {
        const av = resolveStaffAvailability(day, s.working_hours as StaffWorkingHours | undefined);
        if (!av.hasStructuredData || av.dayClosed) continue;
        const work = av.working.reduce((a, w) => a + (w.endMin - w.startMin), 0);
        const breaks = av.breaks.reduce((a, w) => a + (w.endMin - w.startMin), 0);
        available += Math.max(0, work - breaks);
      }

      // Sum booked minutes (non-cancelled / non-no-show) intersecting this day.
      let booked = 0;
      for (const b of bookings) {
        if (b.status === "cancelled" || b.status === "no_show") continue;
        const start = new Date(b.starts_at).getTime();
        const end = new Date(b.ends_at).getTime();
        if (end <= dayStart || start >= dayEnd) continue;
        const overlap = Math.min(end, dayEnd) - Math.max(start, dayStart);
        if (overlap > 0) booked += Math.round(overlap / 60000);
      }

      totalAvailable += available;
      totalBooked += booked;
      const dayPct = available > 0 ? Math.min(100, Math.round((booked / available) * 100)) : 0;
      perDay.push({
        day: day.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" }),
        pct: dayPct,
      });
    }

    const pct = totalAvailable > 0 ? Math.min(100, Math.round((totalBooked / totalAvailable) * 100)) : 0;
    return { pct, bookedMin: totalBooked, availableMin: totalAvailable, perDay };
  }, [bookings, staff]);

  const tone = pct >= 75 ? "text-success-foreground" : pct >= 40 ? "text-primary" : "text-muted-foreground";
  const fmtHrs = (m: number) => `${(m / 60).toFixed(1)}h`;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Gauge className="h-4 w-4 text-muted-foreground" />
            {t("dashboard.occupancy")}
          </h2>
          <p className="text-xs text-muted-foreground">{t("dashboard.occupancyHint")}</p>
        </div>
        <span className={`flex-none text-2xl font-semibold tracking-tight ${tone}`}>{pct}%</span>
      </div>
      {availableMin === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">{t("dashboard.occupancyNoHours")}</p>
      ) : (
        <>
          <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-primary/60"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>{t("dashboard.occupancyBooked", { hours: fmtHrs(bookedMin) })}</span>
            <span>{t("dashboard.occupancyAvailable", { hours: fmtHrs(availableMin) })}</span>
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {perDay.map((d, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <div className="relative flex h-14 w-full items-end overflow-hidden rounded-md bg-muted">
                  <div
                    className="w-full rounded-md bg-primary/80"
                    style={{ height: `${Math.max(4, d.pct)}%` }}
                    title={`${d.day}: ${d.pct}%`}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">{d.day}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
