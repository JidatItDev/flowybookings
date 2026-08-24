import { describe, expect, test } from "vitest";
import { isValidDowngrade, resolveDowngradeCycle } from "@/shop/billing/server/plan-downgrade-decision";

describe("isValidDowngrade", () => {
  test("pro -> starter is a valid downgrade", () => {
    expect(isValidDowngrade("pro", "starter")).toBe(true);
  });
  test("premium -> pro is a valid downgrade", () => {
    expect(isValidDowngrade("premium", "pro")).toBe(true);
  });
  test("starter -> pro is not a downgrade", () => {
    expect(isValidDowngrade("starter", "pro")).toBe(false);
  });
  test("same plan is not a downgrade", () => {
    expect(isValidDowngrade("pro", "pro")).toBe(false);
  });
  test("trial -> starter is not a downgrade (trial ranks lowest)", () => {
    expect(isValidDowngrade("trial", "starter")).toBe(false);
  });
  test("unknown plan strings rank as 0 (trial-equivalent)", () => {
    expect(isValidDowngrade("starter", "bogus")).toBe(true);
  });
});

describe("resolveDowngradeCycle", () => {
  test("explicit yearly request wins", () => {
    expect(resolveDowngradeCycle("yearly", "monthly")).toBe("yearly");
  });
  test("falls back to the shop's current yearly cycle when request omits it", () => {
    expect(resolveDowngradeCycle(undefined, "yearly")).toBe("yearly");
  });
  test("defaults to monthly when neither specifies yearly", () => {
    expect(resolveDowngradeCycle(undefined, "monthly")).toBe("monthly");
    expect(resolveDowngradeCycle(undefined, null)).toBe("monthly");
  });
  test("yearly on either side wins — a monthly request cannot downgrade an already-yearly cycle", () => {
    expect(resolveDowngradeCycle("monthly", "yearly")).toBe("yearly");
  });
});
