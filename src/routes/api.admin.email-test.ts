import { createFileRoute } from "@tanstack/react-router";
import { handlers } from "@/email/server/admin-email-test";

export const Route = createFileRoute("/api/admin/email-test")({
  server: { handlers },
});
