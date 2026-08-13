import { createFileRoute } from "@tanstack/react-router";
import { BookSlugPage, BookSlugPending } from "@/booking/pages/BookSlugPage";
import { getBookingUrl, getPublicAppUrl, getBookingOgImageUrl } from "@/shared/lib/booking-url";
import { resolvePublicBookingShop } from "@/booking/lib/public-booking-shop";

export const Route = createFileRoute("/book/$slug")({
  loader: async ({ params }) => {
    const resolved = await resolvePublicBookingShop(params.slug);
    return { resolved };
  },
  head: ({ loaderData, params }) => {
    const resolved = loaderData?.resolved;
    const slug = params.slug;
    const canonical = getBookingUrl(slug, { external: true });
    const ogImage = getBookingOgImageUrl(slug);
    const appUrl = getPublicAppUrl();

    if (!resolved || resolved.blockReason || !resolved.shopId) {
      return {
        meta: [{ title: "Boekingslink — FlowyBookings" }, { name: "robots", content: "noindex" }],
      };
    }

    const shopName = resolved.name ?? "";
    const title = `Boek bij ${shopName} — FlowyBookings`;
    const description = `Boek direct online een afspraak bij ${shopName}. Snel, veilig en 24/7 beschikbaar.`;

    return {
      meta: [
        { title },
        { name: "description", content: description },
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
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "LocalBusiness",
            name: shopName,
            url: canonical,
            image: ogImage,
            description: description,
            isPartOf: { "@type": "WebSite", url: appUrl },
          }),
        },
      ],
    };
  },
  component: BookSlugPage,
  pendingComponent: BookSlugPending,
});
