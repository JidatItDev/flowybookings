import { describe, expect, test } from "vitest";
import { resolveCancelOutcome, resolveCancelPreflight } from "@/shop/billing/server/cancel-outcome";

describe("resolveCancelOutcome", () => {
  test("cancels locally without calling Mollie when no live keys are configured", () => {
    const result = resolveCancelOutcome({
      hasMollie: false,
      customerId: "cst_1",
      subId: "sub_1",
      mollieResult: null,
    });
    expect(result).toEqual({ kind: "cancel", mollieCancelled: false });
  });

  test("cancels locally without calling Mollie when the shop has no mollie_customer_id", () => {
    const result = resolveCancelOutcome({
      hasMollie: true,
      customerId: null,
      subId: "sub_1",
      mollieResult: null,
    });
    expect(result).toEqual({ kind: "cancel", mollieCancelled: false });
  });

  test("cancels locally without calling Mollie when the shop has no mollie_subscription_id", () => {
    const result = resolveCancelOutcome({
      hasMollie: true,
      customerId: "cst_1",
      subId: null,
      mollieResult: null,
    });
    expect(result).toEqual({ kind: "cancel", mollieCancelled: false });
  });

  test("cancels and reports mollieCancelled when the Mollie delete succeeds", () => {
    const result = resolveCancelOutcome({
      hasMollie: true,
      customerId: "cst_1",
      subId: "sub_1",
      mollieResult: { ok: true },
    });
    expect(result).toEqual({ kind: "cancel", mollieCancelled: true });
  });

  test("fails closed without touching local state when the Mollie delete fails", () => {
    const result = resolveCancelOutcome({
      hasMollie: true,
      customerId: "cst_1",
      subId: "sub_1",
      mollieResult: { ok: false, error: "mollie 500" },
    });
    expect(result).toEqual({ kind: "fail", error: "mollie 500" });
  });

  test("fails with a fallback error message when Mollie gives no error detail", () => {
    const result = resolveCancelOutcome({
      hasMollie: true,
      customerId: "cst_1",
      subId: "sub_1",
      mollieResult: { ok: false },
    });
    expect(result).toEqual({ kind: "fail", error: "unknown_error" });
  });
});

describe("resolveCancelPreflight", () => {
  test("already-cancelled is a no-op, regardless of plan", () => {
    const result = resolveCancelPreflight({ plan: "starter", subscription_status: "cancelled" });
    expect(result).toEqual({ kind: "already_cancelled" });
  });

  test("trial has nothing to cancel", () => {
    const result = resolveCancelPreflight({ plan: "trial", subscription_status: "trial" });
    expect(result).toEqual({ kind: "no_subscription" });
  });

  test("'none' has nothing to cancel — lapsed past expiry, or never subscribed", () => {
    const result = resolveCancelPreflight({ plan: "starter", subscription_status: "none" });
    expect(result).toEqual({ kind: "no_subscription" });
  });

  test("an active paid plan proceeds", () => {
    const result = resolveCancelPreflight({ plan: "pro", subscription_status: "active" });
    expect(result).toEqual({ kind: "proceed" });
  });

  test("payment_failed still proceeds — there's a live subscription to cancel, it's just failing to charge", () => {
    const result = resolveCancelPreflight({ plan: "starter", subscription_status: "payment_failed" });
    expect(result).toEqual({ kind: "proceed" });
  });
});
