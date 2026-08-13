import { createFileRoute } from "@tanstack/react-router";
import { handlers } from "@/email/server/transactional-send";

export const Route = createFileRoute("/lovable/email/transactional/send")({
  server: { handlers },
});
