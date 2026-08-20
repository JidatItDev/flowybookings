import { createFileRoute } from "@tanstack/react-router";
import { NotificationsPage, type NotificationsSearchParams } from "@/shop/notifications/NotificationsPage";

export const Route = createFileRoute("/shop/notifications")({
  head: () => ({ meta: [{ title: "Notifications — FlowyBookings" }] }),
  validateSearch: (s: Record<string, unknown>): NotificationsSearchParams => ({
    topup: s.topup === "return" || s.topup === "cancel" ? s.topup : undefined,
    payment: typeof s.payment === "string" ? s.payment : undefined,
  }),
  component: NotificationsPage,
});
