import { describe, expect, test } from "vitest";
import {
  hasLiveMollieSubscription,
  resolvePendingPlanKeepActive,
  resolveExpirySweepAction,
} from "@/shop/billing/server/expiry-sweep-decision";

describe("hasLiveMollieSubscription", () => {
  test.each([
    ["sub_123", true],
    ["", false],
    [null, false],
    [undefined, false],
  ] as const)("hasLiveMollieSubscription(%s) === %s", (id, expected) => {
    expect(hasLiveMollieSubscription(id)).toBe(expected);
  });
});

describe("resolvePendingPlanKeepActive", () => {
  test("keeps active when Mollie subscription is live", () => {
    expect(resolvePendingPlanKeepActive({ mollie_subscription_id: "sub_1", subscription_status: "cancelled" })).toBe(true);
  });
  test("keeps active when status was already active", () => {
    expect(resolvePendingPlanKeepActive({ mollie_subscription_id: null, subscription_status: "active" })).toBe(true);
  });
  test("does not force active when neither condition holds", () => {
    expect(resolvePendingPlanKeepActive({ mollie_subscription_id: null, subscription_status: "none" })).toBe(false);
  });
});

describe("resolveExpirySweepAction", () => {
  const now = new Date("2026-06-01T00:00:00.000Z").getTime();

  test("skips when Mollie subscription is still live", () => {
    const action = resolveExpirySweepAction(
      { mollie_subscription_id: "sub_1", next_billing_at: null, subscription_status: "active" },
      now,
    );
    expect(action).toBe("skip_live_mollie");
  });

  test("skips when next_billing_at is in the future (e.g. SEPA awaiting collection)", () => {
    const action = resolveExpirySweepAction(
      {
        mollie_subscription_id: null,
        next_billing_at: new Date(now + 24 * 3600 * 1000).toISOString(),
        subscription_status: "active",
      },
      now,
    );
    expect(action).toBe("skip_live_mollie");
  });

  test("expires a cancelled shop with no live Mollie sub and a past next_billing_at", () => {
    const action = resolveExpirySweepAction(
      {
        mollie_subscription_id: null,
        next_billing_at: new Date(now - 24 * 3600 * 1000).toISOString(),
        subscription_status: "cancelled",
      },
      now,
    );
    expect(action).toBe("expire");
  });

  test("expires a payment_failed shop with no live Mollie sub", () => {
    const action = resolveExpirySweepAction(
      { mollie_subscription_id: null, next_billing_at: null, subscription_status: "payment_failed" },
      now,
    );
    expect(action).toBe("expire");
  });

  test("skips a shop already in 'none' status — nothing to do", () => {
    const action = resolveExpirySweepAction(
      { mollie_subscription_id: null, next_billing_at: null, subscription_status: "none" },
      now,
    );
    expect(action).toBe("skip_none");
  });

  test("an unrecognized status (e.g. 'paused') still expires — only 'none' is skipped", () => {
    // Characterization test: the original inline loop's status check only ever
    // gates the "none" case; any other status value (including ones outside the
    // known enum) falls through to "expire" the same as active/cancelled/etc.
    const action = resolveExpirySweepAction(
      { mollie_subscription_id: null, next_billing_at: null, subscription_status: "paused" },
      now,
    );
    expect(action).toBe("expire");
  });

  test("no next_billing_at and no Mollie sub still expires", () => {
    const action = resolveExpirySweepAction(
      { mollie_subscription_id: null, next_billing_at: null, subscription_status: "active" },
      now,
    );
    expect(action).toBe("expire");
  });
});
