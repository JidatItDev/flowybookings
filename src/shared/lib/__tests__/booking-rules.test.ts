import { describe, expect, test } from "vitest";
import { DEFAULT_DEPOSIT_PERCENT, resolveShopDefaultDepositPercent } from "@/shared/lib/booking-rules";

describe("resolveShopDefaultDepositPercent", () => {
  test("missing branding falls back to the default", () => {
    expect(resolveShopDefaultDepositPercent(null)).toBe(DEFAULT_DEPOSIT_PERCENT);
    expect(resolveShopDefaultDepositPercent(undefined)).toBe(DEFAULT_DEPOSIT_PERCENT);
    expect(resolveShopDefaultDepositPercent({})).toBe(DEFAULT_DEPOSIT_PERCENT);
  });
  test("reads branding.rules.defaultDepositPct when present", () => {
    expect(resolveShopDefaultDepositPercent({ rules: { defaultDepositPct: 35 } })).toBe(35);
  });
  test("clamps below 0 to 0", () => {
    expect(resolveShopDefaultDepositPercent({ rules: { defaultDepositPct: -5 } })).toBe(0);
  });
  test("clamps above 100 to 100", () => {
    expect(resolveShopDefaultDepositPercent({ rules: { defaultDepositPct: 150 } })).toBe(100);
  });
  test("non-numeric value falls back to the default", () => {
    expect(resolveShopDefaultDepositPercent({ rules: { defaultDepositPct: "abc" } })).toBe(DEFAULT_DEPOSIT_PERCENT);
  });
  test("explicit 0 is respected, not treated as missing", () => {
    expect(resolveShopDefaultDepositPercent({ rules: { defaultDepositPct: 0 } })).toBe(0);
  });
});
