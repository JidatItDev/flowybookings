import { getBookingUrl, getPublicAppUrl, getBookingOgImageUrl } from "@/shared/lib/booking-url";
import {
  type PublicBookingBlockReason,
  type ResolvedPublicBookingShop,
} from "@/booking/lib/public-booking-shop";

export type BookSearch = { shop?: string };

export type BookLoaderData =
  | { mode: "preset"; shopId: string; shopName: string; shopSlug: string }
  | { mode: "error"; blockReason: PublicBookingBlockReason; shopName: string | null };

export function buildBookHead(opts: {
  shopName?: string | null;
  shopSlug?: string | null;
  shopRef?: string | null;
  noindex?: boolean;
}) {
  const appUrl = getPublicAppUrl();
  const shopName = opts.shopName ?? null;
  const title = shopName
    ? `Boek bij ${shopName} — FlowyBookings`
    : "Boekingslink — FlowyBookings";
  const description = shopName
    ? `Boek direct online een afspraak bij ${shopName}. Snel, veilig en 24/7 beschikbaar.`
    : "Deze pagina heeft een shop-boekingslink nodig.";
  const canonical = opts.shopSlug
    ? getBookingUrl(opts.shopSlug, { external: true })
    : `${appUrl}/book`;
  const ogImage = getBookingOgImageUrl(opts.shopRef ?? opts.shopSlug ?? null);

  return {
    meta: [
      { title },
      { name: "description", content: description },
      ...(opts.noindex ? [{ name: "robots", content: "noindex" }] : []),
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:image", content: ogImage },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: ogImage },
      { property: "og:url", content: canonical },
    ],
    links: [{ rel: "canonical", href: canonical }],
  };
}

export function loaderDataFromResolved(resolved: ResolvedPublicBookingShop): BookLoaderData {
  if (resolved.blockReason) {
    return {
      mode: "error",
      blockReason: resolved.blockReason,
      shopName: resolved.name,
    };
  }
  if (!resolved.shopId) {
    return { mode: "error", blockReason: "not_found", shopName: null };
  }
  return {
    mode: "preset",
    shopId: resolved.shopId,
    shopName: resolved.name ?? "",
    shopSlug: resolved.slug ?? "",
  };
}
