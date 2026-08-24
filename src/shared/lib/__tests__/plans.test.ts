import { describe, expect, test } from "vitest";
import { tierOf, planAllows, requiredTierFor, planLabel, TIER_RANK } from "@/shared/lib/plans";

describe("tierOf", () => {
  test.each([
    ["trial", "basic"],
    ["starter", "basic"],
    ["pro", "pro"],
    ["premium", "premium"],
    ["unknown-value", "basic"],
    [null, "basic"],
    [undefined, "basic"],
  ] as const)("tierOf(%s) === %s", (plan, expected) => {
    expect(tierOf(plan)).toBe(expected);
  });
});

describe("planAllows", () => {
  test("basic-tier plan cannot use a pro feature", () => {
    expect(planAllows("starter", "smsReminders")).toBe(false);
  });
  test("pro-tier plan can use a pro feature", () => {
    expect(planAllows("pro", "smsReminders")).toBe(true);
  });
  test("premium-tier plan can use a basic feature", () => {
    expect(planAllows("premium", "bookings")).toBe(true);
  });
  test("pro plan cannot use a premium-only feature", () => {
    expect(planAllows("pro", "apiAccess")).toBe(false);
  });
  test("trial is treated as basic", () => {
    expect(planAllows("trial", "advancedAnalytics")).toBe(false);
    expect(planAllows("trial", "bookings")).toBe(true);
  });
});

describe("requiredTierFor", () => {
  test("maps each feature to its gating tier", () => {
    expect(requiredTierFor("bookings")).toBe("basic");
    expect(requiredTierFor("smsReminders")).toBe("pro");
    expect(requiredTierFor("apiAccess")).toBe("premium");
  });
});

describe("planLabel", () => {
  test.each([
    ["trial", "Trial"],
    ["pro", "Pro"],
    ["premium", "Premium"],
    ["starter", "Starter"],
    ["unknown", "Starter"],
    [null, "Starter"],
  ] as const)("planLabel(%s) === %s", (plan, expected) => {
    expect(planLabel(plan)).toBe(expected);
  });
});

describe("TIER_RANK", () => {
  test("is strictly increasing basic < pro < premium", () => {
    expect(TIER_RANK.basic).toBeLessThan(TIER_RANK.pro);
    expect(TIER_RANK.pro).toBeLessThan(TIER_RANK.premium);
  });
});
