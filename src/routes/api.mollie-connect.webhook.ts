import { createFileRoute } from "@tanstack/react-router";
import { handlers } from "@/shop/payments/server/connect-webhook";

export const Route = createFileRoute("/api/mollie-connect/webhook")({
  server: { handlers },
});
