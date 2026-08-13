import { createFileRoute } from "@tanstack/react-router";
import { handlers } from "@/email/server/queue-process";

export const Route = createFileRoute("/lovable/email/queue/process")({
  server: { handlers },
});
