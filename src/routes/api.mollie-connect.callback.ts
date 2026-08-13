import { createFileRoute } from "@tanstack/react-router";
import { handlers } from "@/shop/payments/server/connect-callback";

export const Route = createFileRoute("/api/mollie-connect/callback")({
  server: { handlers },
});
