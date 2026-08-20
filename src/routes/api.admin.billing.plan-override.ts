import { createFileRoute } from "@tanstack/react-router";
import { handlers } from "@/admin/billing/server/plan-override";

export const Route = createFileRoute("/api/admin/billing/plan-override")({
  server: { handlers },
});
