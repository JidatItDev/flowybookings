import { createFileRoute } from "@tanstack/react-router";
import { handlers } from "@/shop/payments/server/mollie-webhook";

export const Route = createFileRoute("/api/mollie/webhook")({
  server: { handlers },
});
