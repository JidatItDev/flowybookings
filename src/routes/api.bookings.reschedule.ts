import { createFileRoute } from "@tanstack/react-router";
import { handlers } from "@/booking/server/reschedule";

export const Route = createFileRoute("/api/bookings/reschedule")({
  server: { handlers },
});
