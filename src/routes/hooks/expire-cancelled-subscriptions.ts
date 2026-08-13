import { createFileRoute } from "@tanstack/react-router";
import { handlers } from "@/shop/billing/server/expire-cancelled-subscriptions";

export const Route = createFileRoute("/hooks/expire-cancelled-subscriptions")({
  server: { handlers },
});
