import { describe, expect, test } from "vitest";
import { resolveShopAccessDecision } from "@/shop/payments/server/shop-access-decision";

describe("resolveShopAccessDecision", () => {
  test("caller is the shop owner", () => {
    expect(
      resolveShopAccessDecision({ shopOwnerId: "u1", callerId: "u1", roles: [] }),
    ).toBe("owner");
  });

  test("caller is a super_admin, not the owner", () => {
    expect(
      resolveShopAccessDecision({
        shopOwnerId: "owner-id",
        callerId: "admin-id",
        roles: ["super_admin"],
      }),
    ).toBe("admin");
  });

  test("caller has some other role but not super_admin", () => {
    expect(
      resolveShopAccessDecision({
        shopOwnerId: "owner-id",
        callerId: "staff-id",
        roles: ["staff"],
      }),
    ).toBe("forbidden");
  });

  test("caller has no roles at all", () => {
    expect(
      resolveShopAccessDecision({ shopOwnerId: "owner-id", callerId: "stranger", roles: [] }),
    ).toBe("forbidden");
  });

  test("owner check wins even if roles somehow also contains super_admin", () => {
    expect(
      resolveShopAccessDecision({
        shopOwnerId: "u1",
        callerId: "u1",
        roles: ["super_admin"],
      }),
    ).toBe("owner");
  });
});
