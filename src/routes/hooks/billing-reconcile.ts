import { createFileRoute } from "@tanstack/react-router";
import { handlers } from "@/shop/billing/server/billing-reconcile";

export const Route = createFileRoute("/hooks/billing-reconcile")({
  server: { handlers },
});
