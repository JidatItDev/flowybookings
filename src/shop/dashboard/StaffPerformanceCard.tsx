// Staff performance: bookings + revenue per active staff over the last 30 days.
// Pure presentational — reuses bookings already fetched by the dashboard.

import { useMemo } from "react";
import { UsersRound } from "lucide-react";
import { formatCents } from "@/shared/lib/format";
import { useT } from "@/shared/lib/i18n";
import { useStaffColors, staffInitials } from "@/shop/calendar/staff-color";
import type { BookingWithRelations } from "@/shop/shared/queries-barrel";

type StaffLite = { id: string; full_name: string; is_active: boolean; shop_id: string };

interface Props {
  shopId: string;
  bookings: BookingWithRelations[];
  staff: StaffLite[];
}

export function StaffPerformanceCard({ shopId, bookings, staff }: Props) {
  const { t } = useT();
  const colors = useStaffColors(shopId);

  const rows = useMemo(() => {
    const cutoff = Date.now() - 30 * 86400000;
    const earned = (b: BookingWithRelations) => b.status !== "cancelled" && b.status !== "no_show";
    const map = new Map<string, { bookings: number; revenue: number }>();
    for (const b of bookings) {
      if (!b.staff_id) continue;
      if (new Date(b.starts_at).getTime() < cutoff) continue;
      const cur = map.get(b.staff_id) ?? { bookings: 0, revenue: 0 };
      cur.bookings += 1;
      if (earned(b)) cur.revenue += b.price_cents;
      map.set(b.staff_id, cur);
    }
    return staff
      .filter((s) => s.is_active)
      .map((s) => ({
        id: s.id,
        name: s.full_name,
        bookings: map.get(s.id)?.bookings ?? 0,
        revenue: map.get(s.id)?.revenue ?? 0,
      }))
      .sort((a, b) => b.revenue - a.revenue || b.bookings - a.bookings);
  }, [bookings, staff]);

  const maxRevenue = Math.max(1, ...rows.map((r) => r.revenue));

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <UsersRound className="h-4 w-4 text-muted-foreground" />
            {t("dashboard.staffPerformance")}
          </h2>
          <p className="text-xs text-muted-foreground">{t("dashboard.staffPerformanceHint")}</p>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("insights.notEnoughData")}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const c = colors.get(r.id);
            const pct = maxRevenue > 0 ? Math.round((r.revenue / maxRevenue) * 100) : 0;
            return (
              <li key={r.id}>
                <div className="flex items-center gap-2.5">
                  <span className={`flex h-7 w-7 flex-none items-center justify-center rounded-full text-[10px] font-semibold ${c.dot}`}>
                    {staffInitials(r.name)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.name}</span>
                  <span className="flex-none text-xs text-muted-foreground tabular-nums">
                    {t("dashboard.bookingsCount", { n: r.bookings })}
                  </span>
                  <span className="flex-none text-sm font-semibold tabular-nums">{formatCents(r.revenue)}</span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className={`h-full rounded-full ${c.bg}`} style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
