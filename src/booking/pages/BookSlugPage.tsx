import { getRouteApi } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { PublicBookingFlow } from "@/booking/components/PublicBookingFlow";
import { PublicBookingLinkError } from "@/booking/components/PublicBookingLinkError";

const Route = getRouteApi("/book/$slug");

export function BookSlugPage() {
  const { resolved } = Route.useLoaderData();

  if (resolved.blockReason) {
    return <PublicBookingLinkError reason={resolved.blockReason} shopName={resolved.name} />;
  }

  if (!resolved.shopId) {
    return <PublicBookingLinkError reason="not_found" />;
  }

  return <PublicBookingFlow presetShopId={resolved.shopId} />;
}

export function BookSlugPending() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
