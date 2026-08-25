import { createFileRoute } from "@tanstack/react-router";
import { handlers } from "@/shop/billing/server/plan-downgrade-cancel";

export const Route = createFileRoute("/api/billing/plan-downgrade-cancel")({
  server: { handlers },
});
