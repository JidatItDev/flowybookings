import { createFileRoute } from "@tanstack/react-router";
import { handlers } from "@/booking/server/og/book";

export const Route = createFileRoute("/api/og/book")({
  server: { handlers },
});
