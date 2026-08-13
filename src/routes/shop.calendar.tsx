import { createFileRoute } from "@tanstack/react-router";
import { ShopCalendarPage } from "@/shop/calendar/ShopCalendarPage";

export const Route = createFileRoute("/shop/calendar")({
  head: () => ({ meta: [{ title: "Calendar — FlowyBookings" }] }),
  component: ShopCalendarPage,
});
