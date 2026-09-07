import { createFileRoute } from "@tanstack/react-router";
import { handlers } from "@/booking/server/booking-status";

export const Route = createFileRoute("/api/bookings/status")({
  server: { handlers },
});
