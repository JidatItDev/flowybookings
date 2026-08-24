import { describe, expect, test } from "vitest";
import { resolveCheckoutKind } from "@/shop/billing/server/plan-checkout-decision";

describe("resolveCheckoutKind", () => {
  test("starter -> pro from an active paid plan is an upgrade", () => {
    expect(resolveCheckoutKind("starter", "pro")).toBe("subscription_upgrade");
  });
  test("pro -> premium is an upgrade", () => {
    expect(resolveCheckoutKind("pro", "premium")).toBe("subscription_upgrade");
  });
  test("trial -> any paid plan is a first subscribe, never an upgrade", () => {
    expect(resolveCheckoutKind("trial", "premium")).toBe("subscription_first");
  });
  test("re-subscribing to the same plan is not an upgrade", () => {
    expect(resolveCheckoutKind("pro", "pro")).toBe("subscription_first");
  });
  test("checking out a lower tier from a paid plan is not an upgrade", () => {
    expect(resolveCheckoutKind("premium", "starter")).toBe("subscription_first");
  });
});
