import { supabase } from "@/integrations/supabase/client";

const TERMINAL_STATUSES = new Set(["cancelled", "completed"]);

export type EntityKind = "service" | "staff" | "customer";

type BookingLite = {
  status: string;
  starts_at: string;
  service_id?: string | null;
  staff_id?: string | null;
  customer_id?: string | null;
};

function errText(err: unknown): string {
  const e = err as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown } | null;
  return [
    e && typeof e.message === "string" ? e.message : "",
    e && typeof e.details === "string" ? e.details : "",
    e && typeof e.hint === "string" ? e.hint : "",
    e && typeof e.code === "string" ? e.code : "",
    err instanceof Error ? err.message : typeof err === "string" ? err : "",
  ]
    .filter(Boolean)
    .join(" | ");
}

export function bookingBlocksEntityDelete(b: BookingLite, kind: EntityKind, id: string): boolean {
  const fk = kind === "service" ? b.service_id : kind === "staff" ? b.staff_id : b.customer_id;
  if (fk !== id) return false;
  if (TERMINAL_STATUSES.has(b.status)) return false;
  return new Date(b.starts_at).getTime() >= Date.now();
}

export function entityInUseFromBookings(
  bookings: BookingLite[],
  kind: EntityKind,
  id: string,
): boolean {
  return bookings.some((b) => bookingBlocksEntityDelete(b, kind, id));
}

export async function entityHasOpenFutureBookings(kind: EntityKind, id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("entity_has_open_future_bookings", {
    _kind: kind,
    _id: id,
  });
  if (error) throw error;
  return !!data;
}

export function isEntityInUseError(err: unknown): boolean {
  return /ENTITY_IN_USE/i.test(errText(err));
}

export function isStaffPlanLimitError(err: unknown): boolean {
  return /STAFF_PLAN_LIMIT/i.test(errText(err));
}

export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: unknown } | null;
  if (e && e.code === "23505") return true;
  return /23505|duplicate key|unique constraint/i.test(errText(err));
}
