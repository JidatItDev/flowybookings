import { createFileRoute } from "@tanstack/react-router";
import { handlers } from "@/booking/server/refund";

export const Route = createFileRoute("/api/bookings/refund")({
  server: { handlers },
});
