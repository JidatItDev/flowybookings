import { createFileRoute } from "@tanstack/react-router";
import { handlers } from "@/email/server/trial-reminders";

export const Route = createFileRoute("/hooks/trial-reminders")({
  server: { handlers },
});
