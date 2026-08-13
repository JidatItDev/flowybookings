import { createFileRoute } from "@tanstack/react-router";
import { handlers } from "@/shop/billing/server/expire-sweep";

export const Route = createFileRoute("/api/billing/expire-sweep")({
  server: { handlers },
});
