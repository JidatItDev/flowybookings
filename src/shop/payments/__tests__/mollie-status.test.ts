import { describe, expect, test } from "vitest";
import { mapMollieStatus } from "@/shop/payments/mollie-status";

describe("mapMollieStatus", () => {
  test.each([
    ["paid", "paid"],
    ["authorized", "paid"],
    ["failed", "failed"],
    ["canceled", "failed"],
    ["expired", "failed"],
    ["open", "unpaid"],
    ["pending", "unpaid"],
    [undefined, null],
    [null, null],
  ] as const)("mapMollieStatus(%s) === %s", (input, expected) => {
    expect(mapMollieStatus(input)).toBe(expected);
  });
});
