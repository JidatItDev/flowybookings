import { describe, expect, test } from "vitest";
import {
  resolvePlanChangeDirection,
  resolveDowngradeCancelPreflight,
} from "@/shop/billing/server/plan-downgrade-decision";

describe("resolvePlanChangeDirection", () => {
  test("a higher tier is immediate, regardless of cycle", () => {
    expect(resolvePlanChangeDirection({ plan: "starter", cycle: "monthly" }, { plan: "pro", cycle: "monthly" })).toBe("immediate");
    expect(resolvePlanChangeDirection({ plan: "starter", cycle: "yearly" }, { plan: "pro", cycle: "monthly" })).toBe("immediate");
  });
  test("a lower tier is deferred, regardless of cycle", () => {
    expect(resolvePlanChangeDirection({ plan: "premium", cycle: "monthly" }, { plan: "pro", cycle: "monthly" })).toBe("deferred");
    expect(resolvePlanChangeDirection({ plan: "premium", cycle: "monthly" }, { plan: "pro", cycle: "yearly" })).toBe("deferred");
  });
  test("same tier, same cycle is a no-op", () => {
    expect(resolvePlanChangeDirection({ plan: "pro", cycle: "monthly" }, { plan: "pro", cycle: "monthly" })).toBe("noop");
    expect(resolvePlanChangeDirection({ plan: "pro", cycle: "yearly" }, { plan: "pro", cycle: "yearly" })).toBe("noop");
  });
  test("same tier, switching to yearly is immediate", () => {
    expect(resolvePlanChangeDirection({ plan: "pro", cycle: "monthly" }, { plan: "pro", cycle: "yearly" })).toBe("immediate");
  });
  test("same tier, switching to monthly is deferred", () => {
    expect(resolvePlanChangeDirection({ plan: "pro", cycle: "yearly" }, { plan: "pro", cycle: "monthly" })).toBe("deferred");
  });
  test("missing/null current cycle defaults to monthly", () => {
    expect(resolvePlanChangeDirection({ plan: "pro", cycle: null }, { plan: "pro", cycle: "monthly" })).toBe("noop");
    expect(resolvePlanChangeDirection({ plan: "pro", cycle: undefined }, { plan: "pro", cycle: "yearly" })).toBe("immediate");
  });
  test("trial is the lowest rank — any real plan is immediate from trial", () => {
    expect(resolvePlanChangeDirection({ plan: "trial", cycle: null }, { plan: "starter", cycle: "monthly" })).toBe("immediate");
  });
});

describe("resolveDowngradeCancelPreflight", () => {
  test("a shop with a pending downgrade can cancel it", () => {
    expect(resolveDowngradeCancelPreflight({ pending_plan: "starter" })).toBe("ok");
  });
  test("a shop with no pending downgrade has nothing to cancel", () => {
    expect(resolveDowngradeCancelPreflight({ pending_plan: null })).toBe("no_pending_downgrade");
  });
  test("undefined pending_plan is also 'nothing to cancel'", () => {
    expect(resolveDowngradeCancelPreflight({ pending_plan: undefined })).toBe("no_pending_downgrade");
  });
});
