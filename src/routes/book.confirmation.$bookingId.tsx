import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { formatInShopTz, resolveShopTimezone } from "@/shared/lib/shop-timezone";
import { ConfirmationPage } from "@/booking/pages/ConfirmationPage";

export const Route = createFileRoute("/book/confirmation/$bookingId")({
  loader: async ({ params }) => {
    const { data: rows, error } = await supabase.rpc("get_public_booking_confirmation", {
      _booking_id: params.bookingId,
    });
    if (error || !rows?.length) {
      return {
        shopName: null as string | null,
        shopSlug: null as string | null,
        serviceName: null as string | null,
        dateLabel: null as string | null,
      };
    }
    const booking = rows[0];
    const [{ data: shop }, { data: service }] = await Promise.all([
      supabase.from("shops").select("name, slug, timezone").eq("id", booking.shop_id).maybeSingle(),
      booking.service_id
        ? supabase.from("services").select("name").eq("id", booking.service_id).maybeSingle()
        : Promise.resolve({ data: null as { name: string } | null }),
    ]);
    const start = new Date(booking.starts_at);
    const tz = resolveShopTimezone(shop?.timezone);
    const dateLabel = formatInShopTz(start, tz, "EEEE d MMMM");
    return {
      shopName: shop?.name ?? null,
      shopSlug: shop?.slug ?? null,
      serviceName: service?.name ?? null,
      dateLabel,
    };
  },
  head: ({ loaderData, params }) => {
    const shopName = loaderData?.shopName;
    const serviceName = loaderData?.serviceName;
    const dateLabel = loaderData?.dateLabel;
    const title = shopName
      ? `Boeking bevestigd bij ${shopName} — FlowyBookings`
      : "Boeking bevestigd — FlowyBookings";
    const description =
      shopName && serviceName && dateLabel
        ? `${serviceName} op ${dateLabel} bij ${shopName}.`
        : "Je afspraak is bevestigd.";
    const ogImage = `/api/og/booking?id=${encodeURIComponent(params.bookingId)}`;
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
      ],
    };
  },
  component: ConfirmationPage,
});
