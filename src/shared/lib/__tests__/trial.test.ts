import { describe, expect, test } from "vitest";
import { getTrialState, PAYMENT_FAILED_GRACE_DAYS_CONST } from "@/shared/lib/trial";

const DAY_MS = 1000 * 60 * 60 * 24;

describe("getTrialState", () => {
  test("null/undefined shop returns the unknown, blocked default", () => {
    const state = getTrialState(null);
    expect(state.subscriptionStatus).toBe("unknown");
    expect(state.canAcceptBookings).toBe(false);
    expect(state.isTrial).toBe(false);
  });

  test("active trial with days remaining", () => {
    const expiresAt = new Date(Date.now() + 5 * DAY_MS).toISOString();
    const state = getTrialState({ plan: "trial", plan_expires_at: expiresAt });
    expect(state.isTrial).toBe(true);
    expect(state.isExpired).toBe(false);
    expect(state.subscriptionStatus).toBe("trial");
    expect(state.canAcceptBookings).toBe(true);
    expect(state.daysLeft).toBeGreaterThanOrEqual(4);
  });

  test("expired trial blocks bookings regardless of subscription_status", () => {
    const expiresAt = new Date(Date.now() - DAY_MS).toISOString();
    const state = getTrialState({
      plan: "trial",
      plan_expires_at: expiresAt,
      subscription_status: "active", // stale flag — must not override trial expiry
    });
    expect(state.isExpired).toBe(true);
    expect(state.subscriptionStatus).toBe("expired");
    expect(state.canAcceptBookings).toBe(false);
  });

  test("trial shop never surfaces a payment_failed banner even if payment_failed_at is set", () => {
    const state = getTrialState({
      plan: "trial",
      plan_expires_at: new Date(Date.now() + DAY_MS).toISOString(),
      payment_failed_at: new Date().toISOString(),
    });
    expect(state.paymentFailedAt).toBeNull();
    expect(state.inPaymentFailedGrace).toBe(false);
  });

  test("paid plan with no payment_failed_at is simply active", () => {
    const state = getTrialState({ plan: "pro", subscription_status: "active" });
    expect(state.isTrial).toBe(false);
    expect(state.subscriptionStatus).toBe("active");
    expect(state.canAcceptBookings).toBe(true);
    expect(state.paymentFailedAt).toBeNull();
  });

  test("payment_failed within the 7-day grace window still allows bookings", () => {
    const failedAt = new Date(Date.now() - 3 * DAY_MS).toISOString();
    const state = getTrialState({
      plan: "starter",
      subscription_status: "payment_failed",
      payment_failed_at: failedAt,
    });
    expect(state.inPaymentFailedGrace).toBe(true);
    expect(state.paymentFailedGraceExpired).toBe(false);
    expect(state.canAcceptBookings).toBe(true);
    expect(state.paymentFailedDaysLeft).toBeGreaterThan(0);
  });

  test("payment_failed exactly at the grace boundary is still in grace (inclusive)", () => {
    const failedAt = new Date(Date.now() - PAYMENT_FAILED_GRACE_DAYS_CONST * DAY_MS).toISOString();
    const state = getTrialState({
      plan: "starter",
      subscription_status: "payment_failed",
      payment_failed_at: failedAt,
    });
    expect(state.inPaymentFailedGrace).toBe(true);
    expect(state.canAcceptBookings).toBe(true);
  });

  test("payment_failed past the 7-day grace window blocks bookings", () => {
    const failedAt = new Date(Date.now() - 8 * DAY_MS).toISOString();
    const state = getTrialState({
      plan: "starter",
      subscription_status: "payment_failed",
      payment_failed_at: failedAt,
    });
    expect(state.inPaymentFailedGrace).toBe(false);
    expect(state.paymentFailedGraceExpired).toBe(true);
    expect(state.paymentFailedDaysLeft).toBe(0);
    expect(state.canAcceptBookings).toBe(false);
  });

  test("cancelled subscription status is passed through and still allows bookings (access until expiry)", () => {
    const state = getTrialState({
      plan: "pro",
      subscription_status: "cancelled",
      plan_expires_at: new Date(Date.now() + DAY_MS).toISOString(),
    });
    expect(state.subscriptionStatus).toBe("cancelled");
    expect(state.canAcceptBookings).toBe(true);
    expect(state.cancelledAt).toBeNull(); // no dedicated column — always null per contract
  });

  test("missing subscription_status on a paid plan defaults to active", () => {
    const state = getTrialState({ plan: "premium" });
    expect(state.subscriptionStatus).toBe("active");
    expect(state.canAcceptBookings).toBe(true);
  });
});
