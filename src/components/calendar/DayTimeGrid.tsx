import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { formatCents, formatTime } from "@/lib/format";
import { staffInitials, type StaffColor } from "@/lib/staff-color";
import type { BookingWithRelations } from "@/lib/queries";

/**
 * Visuele dag-rooster (tijdgrid) voor de shop-kalender.
 *
 * - Rijen: uren (configureerbaar via START_HOUR/END_HOUR)
 * - Kolommen: één per actieve medewerker + één "niet toegewezen" kolom
 * - Bookings worden absoluut gepositioneerd binnen hun kolom op basis van
 *   starts_at / ends_at (UTC). Half-open interval [starts_at, ends_at).
 *
 * Pure presentatie — alle data komt van buitenaf, geen mutaties.
 */

const START_HOUR = 8; // 08:00
const END_HOUR = 21; // 21:00 (laatste rij toont 20:00–21:00)
const SLOT_MINUTES = 60;
const PX_PER_HOUR = 64; // 64px per uur → 1 min ≈ 1.07px
const PX_PER_MIN = PX_PER_HOUR / 60;

type StaffLite = {
  id: string;
  full_name: string;
  is_active: boolean;
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
  onSelectBooking?: (b: BookingWithRelations) => void;
  /** Klik op een lege cel → opent nieuwe boeking voor (staffId, time). */
  onSelectSlot?: (params: { staffId: string | null; startsAt: Date }) => void;
};

type Column = {
  key: string;
  label: string;
  staffId: string | null; // null = unassigned
  color: StaffColor | null;
};

export function DayTimeGrid({
  day,
  bookings,
  staff,
  customers,
  services,
  colors,
  staffFilter,
  onSelectBooking,
  onSelectSlot,
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

  const hours = useMemo(() => {
    const arr: number[] = [];
    for (let h = START_HOUR; h <= END_HOUR; h += 1) arr.push(h);
    return arr;
  }, []);

  const totalHeight = (END_HOUR - START_HOUR) * PX_PER_HOUR;

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

          {columns.map((c) => (
            <div
              key={`col-${c.key}`}
              className="relative border-l border-border"
              style={{ height: totalHeight }}
            >
              {/* Uur-grid-lijnen + klikbare slots */}
              {hours.slice(0, -1).map((h, i) => (
                <button
                  key={`slot-${c.key}-${h}`}
                  type="button"
                  onClick={() => {
                    if (!onSelectSlot) return;
                    const startsAt = new Date(dayStart);
                    startsAt.setUTCHours(h, 0, 0, 0);
                    onSelectSlot({ staffId: c.staffId, startsAt });
                  }}
                  className="absolute left-0 right-0 border-t border-dashed border-border/60 transition-colors hover:bg-primary/5"
                  style={{ top: i * PX_PER_HOUR, height: PX_PER_HOUR }}
                  aria-label={`Nieuwe boeking ${c.label} ${String(h).padStart(2, "0")}:00`}
                />
              ))}
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
                  const height = Math.max(24, durMin * PX_PER_MIN - 2);
                  const cust = customers.find((x) => x.id === b.customer_id);
                  const svc = services.find((x) => x.id === b.service_id);
                  const isCancelled = b.status === "cancelled" || b.status === "no_show";
                  const tone = c.color;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => onSelectBooking?.(b)}
                      className={cn(
                        "absolute left-1 right-1 z-[5] overflow-hidden rounded-lg border px-2 py-1 text-left text-[11px] shadow-soft transition-transform hover:z-20 hover:scale-[1.01]",
                        tone
                          ? `${tone.bg} ${tone.text} border-transparent`
                          : "border-border bg-muted text-foreground",
                        isCancelled && "opacity-60 line-through decoration-1",
                      )}
                      style={{ top, height }}
                      title={`${cust?.full_name ?? "—"} · ${svc?.name ?? "—"} · ${formatTime(b.starts_at)}–${formatTime(b.ends_at)}`}
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
                      {height > 44 && (
                        <div className="truncate text-[10px] opacity-90">
                          {svc?.name ?? "—"}
                        </div>
                      )}
                    </button>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
