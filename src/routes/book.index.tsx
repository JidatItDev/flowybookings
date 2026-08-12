import { createFileRoute, redirect } from "@tanstack/react-router";
import { PublicBookingFlow } from "@/components/PublicBookingFlow";
import { PublicBookingLinkError } from "@/components/PublicBookingLinkError";
import { getBookingUrl, getPublicAppUrl, getBookingOgImageUrl } from "@/lib/booking-url";
import {
  resolvePublicBookingShop,
  type PublicBookingBlockReason,
  type ResolvedPublicBookingShop,
} from "@/lib/public-booking-shop";

type BookSearch = { shop?: string };

type BookLoaderData =
  | { mode: "preset"; shopId: string; shopName: string; shopSlug: string }
  | { mode: "error"; blockReason: PublicBookingBlockReason; shopName: string | null };

function buildBookHead(opts: {
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

function loaderDataFromResolved(resolved: ResolvedPublicBookingShop): BookLoaderData {
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

/**
 * Bare /book is not a public marketplace.
 * - No ?shop= → branded link-error page (no shop list)
 * - ?shop=<uuid|slug> → resolve; if slug known, redirect to /book/$slug
 */
export const Route = createFileRoute("/book/")({
  validateSearch: (s: Record<string, unknown>): BookSearch => ({
    shop: typeof s.shop === "string" ? s.shop : undefined,
  }),
  loaderDeps: ({ search }) => ({ shop: search.shop }),
  loader: async ({ deps }): Promise<BookLoaderData> => {
    if (!deps.shop) {
      return { mode: "error", blockReason: "not_found", shopName: null };
    }

    const resolved = await resolvePublicBookingShop(deps.shop);
    const data = loaderDataFromResolved(resolved);

    // Prefer canonical slug URLs over ?shop=
    if (data.mode === "preset" && data.shopSlug) {
      throw redirect({
        to: "/book/$slug",
        params: { slug: data.shopSlug },
        replace: true,
      });
    }

    return data;
  },
  head: ({ loaderData }) => {
    if (loaderData?.mode === "preset") {
      return buildBookHead({
        shopName: loaderData.shopName,
        shopSlug: loaderData.shopSlug,
        shopRef: loaderData.shopSlug || loaderData.shopId,
      });
    }
    return buildBookHead({ noindex: true });
  },
  component: BookIndexPage,
});

function BookIndexPage() {
  const loaderData = Route.useLoaderData();

  if (loaderData.mode === "error") {
    return (
      <PublicBookingLinkError reason={loaderData.blockReason} shopName={loaderData.shopName} />
    );
  }

  return <PublicBookingFlow presetShopId={loaderData.shopId} />;
}
