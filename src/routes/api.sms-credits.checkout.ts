import { createFileRoute } from "@tanstack/react-router";
import { handlers } from "@/shop/notifications/server/sms-credits-checkout";

export const Route = createFileRoute("/api/sms-credits/checkout")({
  server: { handlers },
});
