import { createFileRoute } from "@tanstack/react-router";
import { handlers } from "@/shop/billing/server/plan-downgrade";

export const Route = createFileRoute("/api/billing/plan-downgrade")({
  server: { handlers },
});
