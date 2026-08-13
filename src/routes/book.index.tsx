import { createFileRoute, redirect } from "@tanstack/react-router";
import { BookIndexPage } from "@/booking/pages/BookIndexPage";
import {
  buildBookHead,
  loaderDataFromResolved,
  type BookLoaderData,
  type BookSearch,
} from "@/booking/lib/book-head";
import { resolvePublicBookingShop } from "@/booking/lib/public-booking-shop";

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
