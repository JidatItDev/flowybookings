import { describe, expect, test, vi, beforeEach } from "vitest";

const mollieFetchWithFallback = vi.fn();

vi.mock("@/shared/lib/mollie-platform", () => ({
  mollieFetchWithFallback: (...args: unknown[]) => mollieFetchWithFallback(...args),
  platformMollieWebhookFields: () => ({}),
}));

import {
  cancelMollieSubscription,
  listMollieSubscriptions,
  patchMollieSubscription,
  createMollieSubscription,
  cancelOrphanMollieSubscriptions,
  ensureSinglePlatformSubscription,
  isoFromMollieDate,
  platformSubscriptionDescription,
  type MollieSubSummary,
} from "@/shop/billing/server/mollie-subscriptions";

function fakeResponse(status: number, ok: boolean, text = "") {
  return { response: { ok, status, text: async () => text }, usedKind: "primary" as const };
}

function fakeJsonResponse(status: number, ok: boolean, body: unknown) {
  return {
    response: { ok, status, json: async () => body, text: async () => JSON.stringify(body) },
    usedKind: "primary" as const,
  };
}

function methodOf(init?: RequestInit): string {
  return (init?.method ?? "GET").toUpperCase();
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

describe("isoFromMollieDate", () => {
  test("date-only string is normalized to noon UTC", () => {
    expect(isoFromMollieDate("2026-06-01")).toBe("2026-06-01T12:00:00.000Z");
  });
  test("a full ISO datetime is passed through toISOString()", () => {
    expect(isoFromMollieDate("2026-06-01T08:30:00Z")).toBe("2026-06-01T08:30:00.000Z");
  });
  test("garbage string returns null", () => {
    expect(isoFromMollieDate("not-a-date")).toBeNull();
  });
  test("null/undefined return null", () => {
    expect(isoFromMollieDate(null)).toBeNull();
    expect(isoFromMollieDate(undefined)).toBeNull();
  });
});

describe("platformSubscriptionDescription", () => {
  test("strips dashes and truncates the shop id to 12 chars", () => {
    expect(platformSubscriptionDescription("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")).toBe(
      "FlowyBookings aaaaaaaabbbb",
    );
  });
  test("never includes a plan tier, so descriptions are stable across upgrades/downgrades", () => {
    const desc = platformSubscriptionDescription("shop-id-1");
    expect(desc).not.toMatch(/starter|pro|premium/i);
  });
});

describe("listMollieSubscriptions", () => {
  beforeEach(() => mollieFetchWithFallback.mockReset());

  test("returns the embedded subscriptions array on success", async () => {
    const subs: MollieSubSummary[] = [{ id: "sub_1", status: "active" }];
    mollieFetchWithFallback.mockResolvedValue(fakeJsonResponse(200, true, { _embedded: { subscriptions: subs } }));
    expect(await listMollieSubscriptions("cst_1")).toEqual(subs);
  });

  test("returns [] when the response is not ok", async () => {
    mollieFetchWithFallback.mockResolvedValue(fakeJsonResponse(500, false, {}));
    expect(await listMollieSubscriptions("cst_1")).toEqual([]);
  });

  test("returns [] when there's no Mollie response at all", async () => {
    mollieFetchWithFallback.mockResolvedValue(null);
    expect(await listMollieSubscriptions("cst_1")).toEqual([]);
  });

  test("returns [] when _embedded is missing", async () => {
    mollieFetchWithFallback.mockResolvedValue(fakeJsonResponse(200, true, {}));
    expect(await listMollieSubscriptions("cst_1")).toEqual([]);
  });
});

describe("patchMollieSubscription", () => {
  beforeEach(() => mollieFetchWithFallback.mockReset());

  test("returns the updated subscription on success", async () => {
    mollieFetchWithFallback.mockResolvedValue(fakeJsonResponse(200, true, { id: "sub_1", status: "active" }));
    const result = await patchMollieSubscription({
      customerId: "cst_1",
      subscriptionId: "sub_1",
      shopId: "shop_1",
      plan: "pro",
      cycle: "monthly",
      amountValue: "49.00",
    });
    expect(result).toEqual({ id: "sub_1", status: "active" });
  });

  test("returns null on failure", async () => {
    mollieFetchWithFallback.mockResolvedValue(fakeJsonResponse(422, false, {}));
    const result = await patchMollieSubscription({
      customerId: "cst_1",
      subscriptionId: "sub_1",
      shopId: "shop_1",
      plan: "pro",
      cycle: "monthly",
      amountValue: "49.00",
    });
    expect(result).toBeNull();
  });
});

describe("createMollieSubscription", () => {
  beforeEach(() => mollieFetchWithFallback.mockReset());

  test("returns the created subscription on success", async () => {
    mollieFetchWithFallback.mockResolvedValue(fakeJsonResponse(201, true, { id: "sub_new", status: "active" }));
    const result = await createMollieSubscription({
      customerId: "cst_1",
      shopId: "shop_1",
      plan: "starter",
      cycle: "yearly",
      amountValue: "190.00",
    });
    expect(result).toEqual({ id: "sub_new", status: "active" });
  });

  test("returns null when Mollie rejects the create", async () => {
    mollieFetchWithFallback.mockResolvedValue(fakeJsonResponse(400, false, {}));
    const result = await createMollieSubscription({
      customerId: "cst_1",
      shopId: "shop_1",
      plan: "starter",
      cycle: "yearly",
      amountValue: "190.00",
    });
    expect(result).toBeNull();
  });
});

describe("cancelOrphanMollieSubscriptions", () => {
  beforeEach(() => mollieFetchWithFallback.mockReset());

  test("cancels every active/pending subscription except keepId", async () => {
    const subs: MollieSubSummary[] = [
      { id: "sub_keep", status: "active" },
      { id: "sub_orphan_1", status: "active" },
      { id: "sub_orphan_2", status: "pending" },
      { id: "sub_already_canceled", status: "canceled" },
    ];
    mollieFetchWithFallback.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (methodOf(init) === "GET") return fakeJsonResponse(200, true, { _embedded: { subscriptions: subs } });
      if (methodOf(init) === "DELETE") return fakeResponse(204, true);
      throw new Error("unexpected method");
    });
    const cancelled = await cancelOrphanMollieSubscriptions("cst_1", "sub_keep");
    expect(cancelled.sort()).toEqual(["sub_orphan_1", "sub_orphan_2"]);
  });

  test("cancels everything active/pending when keepId is null", async () => {
    const subs: MollieSubSummary[] = [{ id: "sub_a", status: "active" }, { id: "sub_b", status: "pending" }];
    mollieFetchWithFallback.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (methodOf(init) === "GET") return fakeJsonResponse(200, true, { _embedded: { subscriptions: subs } });
      return fakeResponse(204, true);
    });
    const cancelled = await cancelOrphanMollieSubscriptions("cst_1", null);
    expect(cancelled.sort()).toEqual(["sub_a", "sub_b"]);
  });

  test("a subscription that fails to cancel is excluded from the returned list", async () => {
    const subs: MollieSubSummary[] = [{ id: "sub_fails", status: "active" }];
    mollieFetchWithFallback.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (methodOf(init) === "GET") return fakeJsonResponse(200, true, { _embedded: { subscriptions: subs } });
      return fakeResponse(500, false, "boom");
    });
    const cancelled = await cancelOrphanMollieSubscriptions("cst_1", null);
    expect(cancelled).toEqual([]);
  });
});

describe("ensureSinglePlatformSubscription", () => {
  beforeEach(() => mollieFetchWithFallback.mockReset());

  test("reuses and patches the preferred subscription when it's still active", async () => {
    const subs: MollieSubSummary[] = [{ id: "sub_pref", status: "active" }];
    mollieFetchWithFallback.mockImplementation(async (_url: string, init?: RequestInit) => {
      const method = methodOf(init);
      if (method === "GET") return fakeJsonResponse(200, true, { _embedded: { subscriptions: subs } });
      if (method === "PATCH") return fakeJsonResponse(200, true, { id: "sub_pref", status: "active", nextPaymentDate: "2026-07-01" });
      throw new Error(`unexpected method ${method}`);
    });
    const result = await ensureSinglePlatformSubscription({
      customerId: "cst_1",
      shopId: "shop_1",
      plan: "pro",
      cycle: "monthly",
      amountValue: "49.00",
      preferredSubId: "sub_pref",
    });
    expect(result).toEqual({
      subscriptionId: "sub_pref",
      nextPaymentDate: "2026-07-01T12:00:00.000Z",
      cancelled: [],
    });
  });

  test("reuses the single active subscription when no preferred id matches", async () => {
    const subs: MollieSubSummary[] = [{ id: "sub_only", status: "active" }];
    mollieFetchWithFallback.mockImplementation(async (_url: string, init?: RequestInit) => {
      const method = methodOf(init);
      if (method === "GET") return fakeJsonResponse(200, true, { _embedded: { subscriptions: subs } });
      if (method === "PATCH") return fakeJsonResponse(200, true, { id: "sub_only", status: "active" });
      throw new Error(`unexpected method ${method}`);
    });
    const result = await ensureSinglePlatformSubscription({
      customerId: "cst_1",
      shopId: "shop_1",
      plan: "pro",
      cycle: "monthly",
      amountValue: "49.00",
      preferredSubId: "sub_stale_gone",
    });
    expect(result?.subscriptionId).toBe("sub_only");
  });

  test("cancels orphans and creates fresh when no single active subscription exists", async () => {
    const subs: MollieSubSummary[] = [
      { id: "sub_a", status: "active" },
      { id: "sub_b", status: "active" },
    ];
    mollieFetchWithFallback.mockImplementation(async (_url: string, init?: RequestInit) => {
      const method = methodOf(init);
      if (method === "GET") return fakeJsonResponse(200, true, { _embedded: { subscriptions: subs } });
      if (method === "DELETE") return fakeResponse(204, true);
      if (method === "POST") return fakeJsonResponse(201, true, { id: "sub_fresh", status: "active" });
      throw new Error(`unexpected method ${method}`);
    });
    const result = await ensureSinglePlatformSubscription({
      customerId: "cst_1",
      shopId: "shop_1",
      plan: "premium",
      cycle: "yearly",
      amountValue: "990.00",
      preferredSubId: null,
    });
    expect(result?.subscriptionId).toBe("sub_fresh");
    expect(result?.cancelled.sort()).toEqual(["sub_a", "sub_b"]);
  });

  test("returns null when the patch call fails", async () => {
    const subs: MollieSubSummary[] = [{ id: "sub_pref", status: "active" }];
    mollieFetchWithFallback.mockImplementation(async (_url: string, init?: RequestInit) => {
      const method = methodOf(init);
      if (method === "GET") return fakeJsonResponse(200, true, { _embedded: { subscriptions: subs } });
      if (method === "PATCH") return fakeJsonResponse(422, false, {});
      throw new Error(`unexpected method ${method}`);
    });
    const result = await ensureSinglePlatformSubscription({
      customerId: "cst_1",
      shopId: "shop_1",
      plan: "pro",
      cycle: "monthly",
      amountValue: "49.00",
      preferredSubId: "sub_pref",
    });
    expect(result).toBeNull();
  });

  test("returns null when the create call fails", async () => {
    mollieFetchWithFallback.mockImplementation(async (_url: string, init?: RequestInit) => {
      const method = methodOf(init);
      if (method === "GET") return fakeJsonResponse(200, true, { _embedded: { subscriptions: [] } });
      if (method === "POST") return fakeJsonResponse(400, false, {});
      throw new Error(`unexpected method ${method}`);
    });
    const result = await ensureSinglePlatformSubscription({
      customerId: "cst_1",
      shopId: "shop_1",
      plan: "pro",
      cycle: "monthly",
      amountValue: "49.00",
      preferredSubId: null,
    });
    expect(result).toBeNull();
  });
});
