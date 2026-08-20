import { createFileRoute } from "@tanstack/react-router";
import { handlers } from "@/shop/billing/server/billing-expiry";

export const Route = createFileRoute("/hooks/billing-expiry")({
  server: { handlers },
});
