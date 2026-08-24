import { describe, expect, test } from "vitest";
import { priceFor, nextExpiry, cycleLabel, PLAN_PRICE_CENTS } from "@/admin/settings/platform-billing";

describe("priceFor", () => {
  test("monthly price is the base plan price", () => {
    expect(priceFor("starter", "monthly")).toBe(PLAN_PRICE_CENTS.starter);
    expect(priceFor("pro", "monthly")).toBe(PLAN_PRICE_CENTS.pro);
    expect(priceFor("premium", "monthly")).toBe(PLAN_PRICE_CENTS.premium);
  });

  test("yearly price is 10x monthly (2 months free)", () => {
    expect(priceFor("starter", "yearly")).toBe(PLAN_PRICE_CENTS.starter * 10);
  });

  test("lifetime price is 24x monthly (placeholder, not exposed yet)", () => {
    expect(priceFor("pro", "lifetime")).toBe(PLAN_PRICE_CENTS.pro * 24);
  });
});

describe("nextExpiry", () => {
  test("monthly adds one calendar month", () => {
    const from = new Date("2026-01-15T10:00:00.000Z");
    const next = nextExpiry(from, "monthly");
    expect(next.toISOString()).toBe("2026-02-15T10:00:00.000Z");
  });

  test("yearly adds one calendar year", () => {
    const from = new Date("2026-01-15T10:00:00.000Z");
    const next = nextExpiry(from, "yearly");
    expect(next.toISOString()).toBe("2027-01-15T10:00:00.000Z");
  });

  test("lifetime adds 100 years", () => {
    const from = new Date("2026-01-15T10:00:00.000Z");
    const next = nextExpiry(from, "lifetime");
    expect(next.getUTCFullYear()).toBe(2126);
  });

  test("does not mutate the input date", () => {
    const from = new Date("2026-01-15T10:00:00.000Z");
    const before = from.toISOString();
    nextExpiry(from, "monthly");
    expect(from.toISOString()).toBe(before);
  });

  test("month-end rollover (Jan 31 + 1 month) follows JS Date semantics", () => {
    // JS Date rolls Jan 31 + 1 month into early March since February has no 31st —
    // documenting actual behavior, not asserting an "ideal" one.
    const from = new Date("2026-01-31T00:00:00.000Z");
    const next = nextExpiry(from, "monthly");
    expect(next.getUTCMonth()).toBe(2); // March (0-indexed)
  });
});

describe("cycleLabel", () => {
  test.each([
    ["yearly", "Yearly"],
    ["lifetime", "Lifetime"],
    ["monthly", "Monthly"],
    [null, "Monthly"],
    [undefined, "Monthly"],
    ["garbage", "Monthly"],
  ] as const)("cycleLabel(%s) === %s", (cycle, expected) => {
    expect(cycleLabel(cycle)).toBe(expected);
  });
});
