import { createFileRoute } from "@tanstack/react-router";
import { handlers } from "@/email/server/booking-automations";

export const Route = createFileRoute("/hooks/booking-automations")({
  server: { handlers },
});
