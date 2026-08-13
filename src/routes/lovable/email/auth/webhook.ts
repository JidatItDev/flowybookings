import { createFileRoute } from "@tanstack/react-router";
import { handlers } from "@/email/server/auth-webhook";

export const Route = createFileRoute("/lovable/email/auth/webhook")({
  server: { handlers },
});
