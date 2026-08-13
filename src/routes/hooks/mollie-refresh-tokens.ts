import { createFileRoute } from "@tanstack/react-router";
import { handlers } from "@/shop/payments/server/mollie-refresh-tokens";

export const Route = createFileRoute("/hooks/mollie-refresh-tokens")({
  server: { handlers },
});
