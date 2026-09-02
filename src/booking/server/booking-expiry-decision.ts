// Pure per-booking decision logic for the pending-booking-expiry cron sweep,
// mirroring expiry-sweep-decision.ts's shape (billing) so the same testing
// pattern applies without a fake Supabase client.

export function isPendingBookingExpired(
  booking: { status: string; created_at: string },
  now: number,
  ttlMinutes: number,
): boolean {
  if (booking.status !== "pending") return false;
  const createdAt = new Date(booking.created_at).getTime();
  return now - createdAt >= ttlMinutes * 60_000;
}
