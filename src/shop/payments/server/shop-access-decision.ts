// Pure "who's allowed to touch this shop's Mollie connection" decision,
// shared by connect-authorize.ts and connect-disconnect.ts (both: shop owner
// or super_admin only).

export type ShopAccessDecision = "owner" | "admin" | "forbidden";

export function resolveShopAccessDecision(opts: {
  shopOwnerId: string;
  callerId: string;
  roles: string[];
}): ShopAccessDecision {
  if (opts.shopOwnerId === opts.callerId) return "owner";
  if (opts.roles.includes("super_admin")) return "admin";
  return "forbidden";
}
