import { createFileRoute } from "@tanstack/react-router";
import { handlers } from "@/email/server/transactional-preview";

export const Route = createFileRoute("/lovable/email/transactional/preview")({
  server: { handlers },
});
