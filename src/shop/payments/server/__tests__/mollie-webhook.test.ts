import { describe, expect, test } from "vitest";
import { mapStatus, paymentCollectionAt } from "@/shop/payments/server/mollie-webhook";

describe("mapStatus", () => {
  test.each([
    ["paid", "paid"],
    ["authorized", "paid"],
    ["failed", "failed"],
    ["canceled", "failed"],
    ["expired", "failed"],
    ["open", "unpaid"],
    ["pending", "unpaid"],
    [undefined, null],
  ] as const)("mapStatus(%s) === %s", (input, expected) => {
    expect(mapStatus(input)).toBe(expected);
  });
});

describe("paymentCollectionAt", () => {
  test("null/undefined payment returns null", () => {
    expect(paymentCollectionAt(null)).toBeNull();
    expect(paymentCollectionAt(undefined)).toBeNull();
  });

  test("prefers top-level dueDate", () => {
    const result = paymentCollectionAt({
      id: "tr_1",
      status: "pending",
      dueDate: "2026-06-01",
      details: { transferDate: "2026-06-05" },
    });
    expect(result).toBe("2026-06-01T12:00:00.000Z");
  });

  test("falls back to details.transferDate (SEPA) when dueDate is absent", () => {
    const result = paymentCollectionAt({
      id: "tr_1",
      status: "pending",
      details: { transferDate: "2026-06-05" },
    });
    expect(result).toBe("2026-06-05T12:00:00.000Z");
  });

  test("falls back to details.dueDate when the others are absent", () => {
    const result = paymentCollectionAt({
      id: "tr_1",
      status: "pending",
      details: { dueDate: "2026-06-07" },
    });
    expect(result).toBe("2026-06-07T12:00:00.000Z");
  });

  test("returns null when no date is present anywhere", () => {
    expect(paymentCollectionAt({ id: "tr_1", status: "pending" })).toBeNull();
  });
});
