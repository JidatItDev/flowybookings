/**
 * Map Postgres trigger errors from bookings INSERT/UPDATE to friendly,
 * localised messages. The DB triggers raise:
 *   - BOOKING_CONFLICT       (prevent_overlapping_staff_bookings)
 *   - BOOKING_OUTSIDE_HOURS  (prevent_booking_outside_staff_hours)
 *   - BOOKING_DURING_BREAK   (prevent_booking_outside_staff_hours)
 */
export type BookingErrorKind =
  | "conflict"
  | "outside_hours"
  | "during_break"
  | "unknown";

export type BookingErrorInfo = {
  kind: BookingErrorKind;
  /** Pauze-bereik "HH:MM-HH:MM" indien BOOKING_DURING_BREAK */
  breakRange?: string;
  /** Werkurenbereik "HH:MM-HH:MM" indien BOOKING_OUTSIDE_HOURS */
  hoursRange?: string;
  /** Originele Postgres-melding (voor logging/fallback) */
  raw: string;
};

export function classifyBookingError(err: unknown): BookingErrorInfo {
  const raw = err instanceof Error ? err.message : String(err ?? "");

  if (/BOOKING_DURING_BREAK/i.test(raw)) {
    // bv. "BOOKING_DURING_BREAK: booking overlaps staff break (12:00-13:00)"
    const m = raw.match(/\((\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\)/);
    return {
      kind: "during_break",
      breakRange: m ? `${m[1]}–${m[2]}` : undefined,
      raw,
    };
  }

  if (/BOOKING_OUTSIDE_HOURS/i.test(raw)) {
    // bv. "BOOKING_OUTSIDE_HOURS: 18:30 is outside staff working hours (09:00-17:00)"
    const m = raw.match(/\((\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\)/);
    return {
      kind: "outside_hours",
      hoursRange: m ? `${m[1]}–${m[2]}` : undefined,
      raw,
    };
  }

  if (/BOOKING_CONFLICT/i.test(raw)) {
    return { kind: "conflict", raw };
  }

  return { kind: "unknown", raw };
}

/**
 * Hulpfunctie die de juiste vertaalsleutel + interpolatie-args teruggeeft
 * voor een booking-fout. De caller kiest zelf welke fallback-tekst hij toont
 * voor "unknown".
 */
export function bookingErrorToast(
  err: unknown,
  t: (key: string, vars?: Record<string, string | number>) => string,
  fallback: string,
): string {
  const info = classifyBookingError(err);
  switch (info.kind) {
    case "conflict":
      return t("bookingError.conflict");
    case "outside_hours":
      return info.hoursRange
        ? t("bookingError.outsideHoursRange", { range: info.hoursRange })
        : t("bookingError.outsideHours");
    case "during_break":
      return info.breakRange
        ? t("bookingError.duringBreakRange", { range: info.breakRange })
        : t("bookingError.duringBreak");
    default:
      return fallback;
  }
}
