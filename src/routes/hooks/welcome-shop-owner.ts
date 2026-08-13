import { createFileRoute } from "@tanstack/react-router";
import { handlers } from "@/email/server/welcome-shop-owner";

export const Route = createFileRoute("/hooks/welcome-shop-owner")({
  server: { handlers },
});
