import { createFileRoute } from "@tanstack/react-router";
import { handlers } from "@/email/server/booking-confirmation";

export const Route = createFileRoute("/hooks/booking-confirmation")({
  server: { handlers },
});
