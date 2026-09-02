import { describe, expect, test } from "vitest";
import {
  resolveDepositCents,
  serviceRequiresDeposit,
  serviceRequiresMollie,
  type DepositService,
} from "@/booking/lib/deposit-decision";

describe("resolveDepositCents", () => {
  test("custom mode uses deposit_cents directly", () => {
    const service: DepositService = { deposit_mode: "custom", deposit_cents: 1500, price_cents: 5000 };
    expect(resolveDepositCents(service, 20)).toBe(1500);
  });
  test("custom mode with 0 means explicitly free, ignores shop default", () => {
    const service: DepositService = { deposit_mode: "custom", deposit_cents: 0, price_cents: 5000 };
    expect(resolveDepositCents(service, 20)).toBe(0);
  });
  test("default mode computes percent of price", () => {
    const service: DepositService = { deposit_mode: "default", deposit_cents: 0, price_cents: 5000 };
    expect(resolveDepositCents(service, 20)).toBe(1000);
  });
  test("default mode with 0% shop default resolves to 0", () => {
    const service: DepositService = { deposit_mode: "default", deposit_cents: 0, price_cents: 5000 };
    expect(resolveDepositCents(service, 0)).toBe(0);
  });
  test("default mode rounds to the nearest cent", () => {
    const service: DepositService = { deposit_mode: "default", deposit_cents: 0, price_cents: 999 };
    // 999 * 15 / 100 = 149.85 -> rounds to 150
    expect(resolveDepositCents(service, 15)).toBe(150);
  });
  test("negative custom deposit_cents floors to 0 (defensive)", () => {
    const service: DepositService = { deposit_mode: "custom", deposit_cents: -5, price_cents: 5000 };
    expect(resolveDepositCents(service, 20)).toBe(0);
  });
});

describe("serviceRequiresDeposit / serviceRequiresMollie", () => {
  test("true when resolved deposit is positive", () => {
    const service: DepositService = { deposit_mode: "custom", deposit_cents: 500, price_cents: 5000 };
    expect(serviceRequiresDeposit(service, 20)).toBe(true);
    expect(serviceRequiresMollie(service, 20)).toBe(true);
  });
  test("false when resolved deposit is 0", () => {
    const service: DepositService = { deposit_mode: "custom", deposit_cents: 0, price_cents: 5000 };
    expect(serviceRequiresDeposit(service, 20)).toBe(false);
    expect(serviceRequiresMollie(service, 20)).toBe(false);
  });
  test("default-mode service with 0% shop default does not require a deposit", () => {
    const service: DepositService = { deposit_mode: "default", deposit_cents: 0, price_cents: 5000 };
    expect(serviceRequiresDeposit(service, 0)).toBe(false);
  });
});
