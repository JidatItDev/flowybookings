import { describe, expect, test } from "vitest";
import {
  formatPlanPrice,
  planMonthlyAmount,
  formatBookingFee,
  type PlanPricingMap,
  type PlanPricingRow,
} from "@/shop/billing/use-plan-pricing";

function row(overrides: Partial<PlanPricingRow> = {}): PlanPricingRow {
  return {
    plan_name: "starter",
    monthly_price_cents: 1900,
    currency: "EUR",
    platform_fee_bps: 0,
    booking_fee_cents: 0,
    ...overrides,
  };
}

function mapWith(plan: PlanPricingRow["plan_name"], r: PlanPricingRow): PlanPricingMap {
  return { trial: undefined, starter: undefined, pro: undefined, premium: undefined, [plan]: r };
}

function expectedPriceFormat(amount: number, locale = "nl-NL") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

describe("formatPlanPrice", () => {
  test("a whole-euro price shows no decimals", () => {
    const pricing = mapWith("starter", row({ monthly_price_cents: 1900 }));
    expect(formatPlanPrice(pricing, "starter", "monthly")).toBe(`${expectedPriceFormat(19)}/maand`);
  });

  test("a fractional price (e.g. an admin-set promo) keeps its cents — not silently rounded to whole euros", () => {
    const pricing = mapWith("starter", row({ monthly_price_cents: 123 }));
    expect(formatPlanPrice(pricing, "starter", "monthly")).toBe(`${expectedPriceFormat(1.23)}/maand`);
  });

  test("yearly applies the 10x multiplier and the yearly suffix", () => {
    const pricing = mapWith("pro", row({ plan_name: "pro", monthly_price_cents: 4900 }));
    expect(formatPlanPrice(pricing, "pro", "yearly")).toBe(`${expectedPriceFormat(490)}/jaar`);
  });

  test("a fractional yearly total also keeps 2 decimals", () => {
    const pricing = mapWith("starter", row({ monthly_price_cents: 123 }));
    expect(formatPlanPrice(pricing, "starter", "yearly")).toBe(`${expectedPriceFormat(12.3)}/jaar`);
  });

  test("empty string when the plan is missing from the pricing map", () => {
    const pricing = mapWith("starter", row());
    expect(formatPlanPrice(pricing, "pro", "monthly")).toBe("");
  });

  test("empty string when pricing hasn't loaded yet", () => {
    expect(formatPlanPrice(undefined, "starter", "monthly")).toBe("");
  });

  test("empty string for a zero-priced row", () => {
    const pricing = mapWith("trial", row({ plan_name: "trial", monthly_price_cents: 0 }));
    expect(formatPlanPrice(pricing, "trial", "monthly")).toBe("");
  });
});

describe("planMonthlyAmount", () => {
  test("converts cents to major currency units", () => {
    const pricing = mapWith("starter", row({ monthly_price_cents: 1900 }));
    expect(planMonthlyAmount(pricing, "starter")).toBe(19);
  });

  test("a fractional price round-trips exactly, not truncated", () => {
    const pricing = mapWith("pro", row({ plan_name: "pro", monthly_price_cents: 123 }));
    expect(planMonthlyAmount(pricing, "pro")).toBe(1.23);
  });

  test("null when the plan is missing from the pricing map", () => {
    const pricing = mapWith("starter", row());
    expect(planMonthlyAmount(pricing, "premium")).toBeNull();
  });

  test("null when pricing hasn't loaded yet", () => {
    expect(planMonthlyAmount(undefined, "starter")).toBeNull();
  });
});

describe("formatBookingFee", () => {
  test("zero fee shows the Dutch 'no fee' label by default", () => {
    const pricing = mapWith("premium", row({ plan_name: "premium", booking_fee_cents: 0 }));
    expect(formatBookingFee(pricing, "premium")).toBe("Geen boekingsfee");
  });

  test("zero fee shows the English 'no fee' label for an en- locale", () => {
    const pricing = mapWith("premium", row({ plan_name: "premium", booking_fee_cents: 0 }));
    expect(formatBookingFee(pricing, "premium", "en-US")).toBe("No booking fee");
  });

  test("a positive fee always shows 2 decimal places, per booking", () => {
    const pricing = mapWith("starter", row({ booking_fee_cents: 50 }));
    const expected = new Intl.NumberFormat("nl-NL", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(0.5);
    expect(formatBookingFee(pricing, "starter")).toBe(`${expected} per boeking`);
  });

  test("empty string when the plan is missing from the pricing map", () => {
    const pricing = mapWith("starter", row());
    expect(formatBookingFee(pricing, "pro")).toBe("");
  });

  test("empty string when pricing hasn't loaded yet", () => {
    expect(formatBookingFee(undefined, "starter")).toBe("");
  });
});
