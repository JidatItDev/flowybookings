import { createFileRoute } from "@tanstack/react-router";
import { handlers } from "@/email/server/unsubscribe";

export const Route = createFileRoute("/email/unsubscribe")({
  server: { handlers },
});
