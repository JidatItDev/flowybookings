import { createFileRoute } from "@tanstack/react-router";
import { handlers } from "@/shop/billing/server/plan-cancel";

export const Route = createFileRoute("/api/billing/plan-cancel")({
  server: { handlers },
});
