import { createFileRoute } from "@tanstack/react-router";
import { handlers } from "@/shop/billing/server/plan-confirm";

export const Route = createFileRoute("/api/billing/plan-confirm")({
  server: { handlers },
});
