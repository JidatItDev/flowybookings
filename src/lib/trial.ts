// Trial + subscription state helpers — single source of truth for UI gating.
// Reads from shops.plan, shops.plan_expires_at, and shops.onboarding (jsonb).
// The Mollie webhook writes subscription_status + payment_failed_at into onboarding.
//
// Booking-block rules (mirrored in DB function shop_can_accept_bookings):
//   - trial expired                                       → no bookings
//   - paid plan + payment_failed > 7 days ago             → no bookings (grace expired)
//   - everything else                                     → bookings allowed

const PAYMENT_FAILED_GRACE_DAYS = 7;
const DAY_MS = 1000 * 60 * 60 * 24;

export type SubscriptionStatus =
  | "trial"
  | "active"
  | "payment_failed"
  | "cancelled" // sub cancelled but still active until plan_expires_at
  | "expired"
  | "unknown";

export type TrialState = {
  isTrial: boolean;
  isExpired: boolean; // trial expired
  daysLeft: number | null; // trial days left, null when not on trial
  expiresAt: Date | null;
  subscriptionStatus: SubscriptionStatus;
  // payment_failed fields (paid plans only)
  paymentFailedAt: Date | null;
  inPaymentFailedGrace: boolean;
  paymentFailedDaysLeft: number | null;
  paymentFailedGraceExpired: boolean;
  // Cancellation
  cancelledAt: Date | null;
  // Composite gate: should the UI allow new bookings?
  canAcceptBookings: boolean;
};

export function getTrialState(shop: {
  plan?: string | null;
  plan_expires_at?: string | null;
  onboarding?: Record<string, unknown> | null;
} | null | undefined): TrialState {
  if (!shop) {
    return {
      isTrial: false, isExpired: false, daysLeft: null, expiresAt: null,
      subscriptionStatus: "unknown",
      paymentFailedAt: null, inPaymentFailedGrace: false, paymentFailedDaysLeft: null,
      paymentFailedGraceExpired: false, cancelledAt: null, canAcceptBookings: false,
    };
  }
  const plan = shop.plan ?? "trial";
  const isTrial = plan === "trial";
  const expiresAt = shop.plan_expires_at ? new Date(shop.plan_expires_at) : null;
  const now = Date.now();
  const isExpired = isTrial && !!expiresAt && expiresAt.getTime() < now;
  const daysLeft = isTrial && expiresAt ? Math.ceil((expiresAt.getTime() - now) / DAY_MS) : null;

  const ob = (shop.onboarding ?? {}) as Record<string, unknown>;
  const fromOb = ob.subscription_status as string | undefined;
  const failedAtRaw = ob.payment_failed_at as string | undefined;
  const cancelledAtRaw = ob.subscription_cancelled_at as string | undefined;

  const paymentFailedAt = failedAtRaw ? new Date(failedAtRaw) : null;
  const cancelledAt = cancelledAtRaw ? new Date(cancelledAtRaw) : null;

  let inPaymentFailedGrace = false;
  let paymentFailedDaysLeft: number | null = null;
  let paymentFailedGraceExpired = false;
  if (paymentFailedAt) {
    const graceEnd = paymentFailedAt.getTime() + PAYMENT_FAILED_GRACE_DAYS * DAY_MS;
    inPaymentFailedGrace = now <= graceEnd;
    paymentFailedDaysLeft = inPaymentFailedGrace
      ? Math.max(0, Math.ceil((graceEnd - now) / DAY_MS))
      : 0;
    paymentFailedGraceExpired = !inPaymentFailedGrace;
  }

  const subscriptionStatus: SubscriptionStatus =
    (fromOb as SubscriptionStatus) ??
    (isTrial ? (isExpired ? "expired" : "trial") : "active");

  // Composite booking gate (matches DB shop_can_accept_bookings exactly)
  let canAcceptBookings: boolean;
  if (isTrial) {
    canAcceptBookings = !isExpired;
  } else if (subscriptionStatus === "payment_failed" && paymentFailedAt) {
    canAcceptBookings = inPaymentFailedGrace;
  } else {
    canAcceptBookings = true;
  }

  return {
    isTrial, isExpired, daysLeft, expiresAt, subscriptionStatus,
    paymentFailedAt, inPaymentFailedGrace, paymentFailedDaysLeft, paymentFailedGraceExpired,
    cancelledAt, canAcceptBookings,
  };
}

export const PAYMENT_FAILED_GRACE_DAYS_CONST = PAYMENT_FAILED_GRACE_DAYS;
