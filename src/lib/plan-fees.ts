// Client-safe per-plan booking fee constants & helper.
// SAFE to import from client components — no server-only deps.
//
// Server code (api.bookings.checkout) re-exports these from @/lib/mollie-connect
// so there is still a single source of truth.

export const PLAN_BOOKING_FEE_CENTS: Record<string, number> = {
  trial: 0,
  starter: 50,
  pro: 30,
  premium: 0,
};

export const BOOKING_FEE_CENTS_DEFAULT = PLAN_BOOKING_FEE_CENTS.starter;

/** Returns the fixed booking fee (in cents) for a given plan. */
export function bookingFeeCentsForPlan(plan: string | null | undefined): number {
  if (!plan) return BOOKING_FEE_CENTS_DEFAULT;
  return PLAN_BOOKING_FEE_CENTS[plan] ?? BOOKING_FEE_CENTS_DEFAULT;
}
