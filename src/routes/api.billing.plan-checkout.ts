import { createFileRoute } from "@tanstack/react-router";
import { handlers } from "@/shop/billing/server/plan-checkout";

export const Route = createFileRoute("/api/billing/plan-checkout")({
  server: { handlers },
});
