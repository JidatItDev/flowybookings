import { createFileRoute } from "@tanstack/react-router";
import { AnalyticsPage } from "@/shop/analytics/AnalyticsPage";

export const Route = createFileRoute("/shop/analytics")({
  head: () => ({ meta: [{ title: "Analytics — FlowyBookings" }] }),
  component: AnalyticsPage,
});
