import { createFileRoute } from "@tanstack/react-router";
import { handlers } from "@/email/server/suppression";

export const Route = createFileRoute("/lovable/email/suppression")({
  server: { handlers },
});
