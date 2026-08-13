import { createFileRoute } from "@tanstack/react-router";
import { handlers } from "@/booking/server/ics";

export const Route = createFileRoute("/api/booking/$bookingId/ics")({
  server: { handlers },
});
