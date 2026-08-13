import { createFileRoute } from "@tanstack/react-router";
import { handlers } from "@/booking/server/checkout";

export const Route = createFileRoute("/api/bookings/checkout")({
  server: { handlers },
});
