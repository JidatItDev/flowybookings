import { createFileRoute } from "@tanstack/react-router";
import { handlers } from "@/shop/billing/server/plan-sync";

export const Route = createFileRoute("/api/billing/plan-sync")({
  server: { handlers },
});
