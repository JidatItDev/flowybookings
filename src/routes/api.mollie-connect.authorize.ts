import { createFileRoute } from "@tanstack/react-router";
import { handlers } from "@/shop/payments/server/connect-authorize";

export const Route = createFileRoute("/api/mollie-connect/authorize")({
  server: { handlers },
});
