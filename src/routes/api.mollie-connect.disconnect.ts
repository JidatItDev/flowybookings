import { createFileRoute } from "@tanstack/react-router";
import { handlers } from "@/shop/payments/server/connect-disconnect";

export const Route = createFileRoute("/api/mollie-connect/disconnect")({
  server: { handlers },
});
