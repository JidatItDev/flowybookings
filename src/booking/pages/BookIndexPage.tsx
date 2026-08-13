import { getRouteApi } from "@tanstack/react-router";
import { PublicBookingFlow } from "@/booking/components/PublicBookingFlow";
import { PublicBookingLinkError } from "@/booking/components/PublicBookingLinkError";

const Route = getRouteApi("/book/");

export function BookIndexPage() {
  const loaderData = Route.useLoaderData();

  if (loaderData.mode === "error") {
    return (
      <PublicBookingLinkError reason={loaderData.blockReason} shopName={loaderData.shopName} />
    );
  }

  return <PublicBookingFlow presetShopId={loaderData.shopId} />;
}
