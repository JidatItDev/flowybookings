import { describe, expect, test } from "vitest";
import { computeSmsTopupResult, isSmsTopupAlreadyApplied } from "@/shop/notifications/server/sms-credits-decision";

describe("computeSmsTopupResult", () => {
  test("adds credits to an existing positive balance, not resumed", () => {
    expect(computeSmsTopupResult(50, 100)).toEqual({ newBalance: 150, resumed: false });
  });
  test("balance crossing from zero to positive is a resume", () => {
    expect(computeSmsTopupResult(0, 100)).toEqual({ newBalance: 100, resumed: true });
  });
  test("balance crossing from negative to positive is a resume", () => {
    expect(computeSmsTopupResult(-20, 100)).toEqual({ newBalance: 80, resumed: true });
  });
  test("top-up that doesn't clear a negative balance is not a resume", () => {
    expect(computeSmsTopupResult(-200, 50)).toEqual({ newBalance: -150, resumed: false });
  });
});

describe("isSmsTopupAlreadyApplied", () => {
  test("true only when credits_applied is exactly boolean true", () => {
    expect(isSmsTopupAlreadyApplied({ credits_applied: true })).toBe(true);
  });
  test("false when the flag is absent", () => {
    expect(isSmsTopupAlreadyApplied({})).toBe(false);
  });
  test("false for a truthy-but-not-boolean value", () => {
    expect(isSmsTopupAlreadyApplied({ credits_applied: "true" })).toBe(false);
  });
});
