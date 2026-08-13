import { createFileRoute } from "@tanstack/react-router";
import { handlers } from "@/booking/server/og/booking";

export const Route = createFileRoute("/api/og/booking")({
  server: { handlers },
});
