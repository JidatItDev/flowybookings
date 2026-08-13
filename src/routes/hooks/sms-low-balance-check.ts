import { createFileRoute } from "@tanstack/react-router";
import { handlers } from "@/shop/notifications/server/sms-low-balance-check";

export const Route = createFileRoute("/hooks/sms-low-balance-check")({
  server: { handlers },
});
