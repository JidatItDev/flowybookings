import { cn } from "@/shared/lib/utils";
import { formatCents, formatTime } from "@/shared/lib/format";
import type { StaffColor } from "@/shop/calendar/staff-color";
import type { BookingWithRelations } from "@/shop/shared/queries-barrel";

/**
 * Shared booking card — single source of truth for visual rendering of a
 * booking across mobile list view and desktop/tablet grid blocks.
 *
 * Pure presentation: receives already-resolved customer/service/staff names
 * + a staff color resolver result. Does NOT query, mutate or own state.
 *
 * Variants:
 *  - "card"   → mobile/list: full-width, padding, all rows visible
 *  - "block"  → grid (day/week): compact, fits inside an absolutely-positioned
 *               column block. Designed to be wrapped by an interactive parent
 *               (the grid uses a draggable <button>); this variant renders the
 *               inner content only and never owns its own onClick.
 *
 * Status indicator is always a small colored dot — no text label noise.
 */

type StatusKey = BookingWithRelations["status"];

const STATUS_DOT: Record<StatusKey, string> = {
  pending: "bg-warning",
  confirmed: "bg-info",
  completed: "bg-emerald-500",
  cancelled: "bg-muted-foreground/40",
  no_show: "bg-destructive",
};

export type BookingCardData = {
  booking: BookingWithRelations;
  customerName: string | null;
  serviceName: string | null;
  staffName: string | null;
  /** Resolved staff color (from useStaffColors().get(staffId)) — null when unassigned. */
  color: StaffColor | null;
};

export type BookingCardProps = BookingCardData & {
  variant?: "card" | "block";
  /** Localized fallback for unassigned (e.g. "Niet toegewezen"). */
  unassignedLabel?: string;
  /** Localized status label (for tooltip/aria on the status dot). */
  statusLabel?: string;
  /**
   * Mobile/list only. When provided, the component renders a <button> wrapper
   * with active feedback and accent border. For grid blocks, omit this and
   * wrap the component in your own draggable element.
   */
  onClick?: () => void;
  /** Optional staggered fade-in index for list rendering. */
  animationIndex?: number;
  className?: string;
};

export function BookingCard({
  booking,
  customerName,
  serviceName,
  staffName,
  color,
  variant = "card",
  unassignedLabel = "—",
  statusLabel,
  onClick,
  animationIndex,
  className,
}: BookingCardProps) {
  const isCancelled = booking.status === "cancelled" || booking.status === "no_show";
  const dotClass = STATUS_DOT[booking.status] ?? "bg-muted-foreground/40";

  if (variant === "block") {
    // Compact rendering for grid columns. No wrapper button — caller owns interactivity.
    return (
      <div className={cn("flex h-full min-w-0 flex-col gap-0.5 px-2 py-1.5 text-left", className)}>
        <div className="flex items-center justify-between gap-1.5">
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotClass)}
              title={statusLabel}
              aria-label={statusLabel}
            />
            <span
              className={cn(
                "truncate text-[11px] font-semibold tabular-nums text-foreground/90",
                isCancelled && "line-through",
              )}
            >
              {formatTime(booking.starts_at)}
            </span>
          </span>
          <span className="shrink-0 text-[11px] font-semibold tabular-nums text-foreground/80">
            {formatCents(booking.price_cents)}
          </span>
        </div>
        <div className={cn("truncate text-[12px] font-semibold leading-tight", isCancelled && "line-through")}>
          {customerName ?? unassignedLabel}
        </div>
        {serviceName && (
          <div className="truncate text-[11px] leading-tight text-muted-foreground">
            {serviceName}
          </div>
        )}
      </div>
    );
  }

  // "card" variant — mobile/list view.
  const content = (
    <>
      {/* 4px left accent in staff color (or muted when unassigned). */}
      <span
        className={cn("w-1 shrink-0", color ? color.swatch : "bg-muted-foreground/40")}
        aria-hidden="true"
      />
      <div className="flex-1 px-4 py-3.5">
        {/* Row 1: status dot + client name (primary) + price (right) */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cn("h-2 w-2 shrink-0 rounded-full", dotClass)}
              title={statusLabel}
              aria-label={statusLabel}
            />
            <span
              className={cn(
                "truncate text-base font-semibold text-foreground",
                isCancelled && "line-through",
              )}
            >
              {customerName ?? unassignedLabel}
            </span>
          </div>
          <span className="shrink-0 text-base font-semibold tabular-nums text-foreground">
            {formatCents(booking.price_cents)}
          </span>
        </div>

        {/* Row 2: service (secondary) */}
        <div className="mt-1 truncate text-sm text-muted-foreground">
          {serviceName ?? "—"}
        </div>

        {/* Row 3: time range + staff dot/name */}
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {formatTime(booking.starts_at)} – {formatTime(booking.ends_at)}
          </span>
          {staffName && color ? (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <span className={cn("h-2 w-2 shrink-0 rounded-full", color.swatch)} aria-hidden="true" />
              <span className="max-w-[140px] truncate">{staffName}</span>
            </span>
          ) : (
            <span className="italic">{unassignedLabel}</span>
          )}
        </div>
      </div>
    </>
  );

  const baseClasses = cn(
    "relative flex w-full overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm transition-all",
    isCancelled && "opacity-60",
    className,
  );

  const style =
    animationIndex != null
      ? { animationDelay: `${Math.min(animationIndex, 8) * 30}ms` }
      : undefined;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`${customerName ?? ""} — ${serviceName ?? ""} — ${formatTime(booking.starts_at)}`}
        className={cn(baseClasses, "active:scale-[0.99] active:bg-muted/40", animationIndex != null && "animate-fade-in")}
        style={style}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={cn(baseClasses, animationIndex != null && "animate-fade-in")}
      style={style}
    >
      {content}
    </div>
  );
}
