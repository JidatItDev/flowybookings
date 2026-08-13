import { supabase } from "@/integrations/supabase/client";

export type PublicBookingBlockReason = "not_found" | "inactive" | "unavailable";

export type ResolvedPublicBookingShop = {
  found: boolean;
  shopId: string | null;
  name: string | null;
  slug: string | null;
  logoUrl: string | null;
  blockReason: PublicBookingBlockReason | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(ref: string): boolean {
  return UUID_RE.test(ref.trim());
}

export async function resolvePublicBookingShop(ref: string): Promise<ResolvedPublicBookingShop> {
  const trimmed = ref.trim();
  if (!trimmed) {
    return {
      found: false,
      shopId: null,
      name: null,
      slug: null,
      logoUrl: null,
      blockReason: "not_found",
    };
  }

  const { data, error } = await supabase.rpc("resolve_public_booking_shop", {
    _ref: trimmed,
  });
  if (error) throw error;

  const row = data?.[0];
  if (!row) {
    return {
      found: false,
      shopId: null,
      name: null,
      slug: null,
      logoUrl: null,
      blockReason: "not_found",
    };
  }

  const blockReason = row.block_reason as PublicBookingBlockReason | null;
  return {
    found: row.found,
    shopId: row.shop_id,
    name: row.name,
    slug: row.slug,
    logoUrl: row.logo_url,
    blockReason: blockReason ?? null,
  };
}

export function isResolvableForBooking(
  result: ResolvedPublicBookingShop,
): result is ResolvedPublicBookingShop & { shopId: string; blockReason: null } {
  return !!result.shopId && result.blockReason === null;
}
