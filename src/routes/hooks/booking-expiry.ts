import { createFileRoute } from "@tanstack/react-router";
import { handlers } from "@/booking/server/booking-expiry";

export const Route = createFileRoute("/hooks/booking-expiry")({
  server: { handlers },
});
