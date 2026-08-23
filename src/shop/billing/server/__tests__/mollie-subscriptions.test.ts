import { describe, expect, test, vi, beforeEach } from "vitest";

const mollieFetchWithFallback = vi.fn();

vi.mock("@/shared/lib/mollie-platform", () => ({
  mollieFetchWithFallback: (...args: unknown[]) => mollieFetchWithFallback(...args),
  platformMollieWebhookFields: () => ({}),
}));

import { cancelMollieSubscription } from "@/shop/billing/server/mollie-subscriptions";

function fakeResponse(status: number, ok: boolean, text = "") {
  return { response: { ok, status, text: async () => text }, usedKind: "primary" as const };
}

describe("cancelMollieSubscription", () => {
  beforeEach(() => {
    mollieFetchWithFallback.mockReset();
  });

  test("reports ok:true when Mollie confirms deletion", async () => {
    mollieFetchWithFallback.mockResolvedValue(fakeResponse(204, true));
    const result = await cancelMollieSubscription("cst_1", "sub_1");
    expect(result).toEqual({ ok: true });
  });

  test("reports ok:true when Mollie says the subscription is already gone (404)", async () => {
    mollieFetchWithFallback.mockResolvedValue(fakeResponse(404, false));
    const result = await cancelMollieSubscription("cst_1", "sub_1");
    expect(result).toEqual({ ok: true });
  });

  test("reports ok:false with the error body on a real Mollie failure", async () => {
    mollieFetchWithFallback.mockResolvedValue(fakeResponse(500, false, "internal error"));
    const result = await cancelMollieSubscription("cst_1", "sub_1");
    expect(result).toEqual({ ok: false, error: "internal error" });
  });

  test("reports ok:false when there is no Mollie key configured to even attempt the call", async () => {
    mollieFetchWithFallback.mockResolvedValue(null);
    const result = await cancelMollieSubscription("cst_1", "sub_1");
    expect(result).toEqual({ ok: false, error: "no_mollie_response" });
  });
});
