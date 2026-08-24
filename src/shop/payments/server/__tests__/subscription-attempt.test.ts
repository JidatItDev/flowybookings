import { describe, expect, test } from "vitest";
import {
  isAbandonedFirstAttempt,
  isFailedUpgradeCheckout,
  needsSubscriptionSync,
} from "@/shop/payments/server/subscription-attempt";

describe("isAbandonedFirstAttempt", () => {
  test("canceled first-checkout is abandoned", () => {
    expect(isAbandonedFirstAttempt("canceled", "subscription_first")).toBe(true);
  });
  test("expired first-checkout is abandoned", () => {
    expect(isAbandonedFirstAttempt("expired", "subscription_first")).toBe(true);
  });
  test("legacy 'subscription' kind also counts", () => {
    expect(isAbandonedFirstAttempt("canceled", "subscription")).toBe(true);
  });
  test("canceled UPGRADE checkout is not an abandoned first attempt", () => {
    expect(isAbandonedFirstAttempt("canceled", "subscription_upgrade")).toBe(false);
  });
  test("canceled recurring charge is not an abandoned first attempt", () => {
    expect(isAbandonedFirstAttempt("canceled", "subscription_recurring")).toBe(false);
  });
  test("failed status (not canceled/expired) is not an abandoned first attempt", () => {
    expect(isAbandonedFirstAttempt("failed", "subscription_first")).toBe(false);
  });
  test("null raw status is not abandoned", () => {
    expect(isAbandonedFirstAttempt(null, "subscription_first")).toBe(false);
  });
});

describe("isFailedUpgradeCheckout", () => {
  test("failed upgrade checkout is flagged", () => {
    expect(isFailedUpgradeCheckout("subscription_upgrade", "failed")).toBe(true);
  });
  test("paid upgrade checkout is not flagged", () => {
    expect(isFailedUpgradeCheckout("subscription_upgrade", "paid")).toBe(false);
  });
  test("failed first-time checkout is not an upgrade failure", () => {
    expect(isFailedUpgradeCheckout("subscription_first", "failed")).toBe(false);
  });
  test("failed recurring charge is not an upgrade failure", () => {
    expect(isFailedUpgradeCheckout("subscription_recurring", "failed")).toBe(false);
  });
});

describe("needsSubscriptionSync", () => {
  test("first-time paid checkout with Mollie configured needs sync", () => {
    expect(needsSubscriptionSync({ hasMollie: true, hasCustomerId: true, kind: "subscription_first" })).toBe(true);
  });
  test("upgrade checkout needs sync", () => {
    expect(needsSubscriptionSync({ hasMollie: true, hasCustomerId: true, kind: "subscription_upgrade" })).toBe(true);
  });
  test("recurring renewal does NOT need a fresh sync (subscription already exists)", () => {
    expect(needsSubscriptionSync({ hasMollie: true, hasCustomerId: true, kind: "subscription_recurring" })).toBe(false);
  });
  test("no Mollie keys configured means no sync regardless of kind", () => {
    expect(needsSubscriptionSync({ hasMollie: false, hasCustomerId: true, kind: "subscription_first" })).toBe(false);
  });
  test("no customer id means no sync", () => {
    expect(needsSubscriptionSync({ hasMollie: true, hasCustomerId: false, kind: "subscription_first" })).toBe(false);
  });
  test("unrecognized kind does not sync", () => {
    expect(needsSubscriptionSync({ hasMollie: true, hasCustomerId: true, kind: "sms_credits" })).toBe(false);
  });
});
