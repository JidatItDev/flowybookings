import { createFileRoute } from "@tanstack/react-router";
import { handlers } from "@/email/server/auth-preview";

export const Route = createFileRoute("/lovable/email/auth/preview")({
  server: { handlers },
});
