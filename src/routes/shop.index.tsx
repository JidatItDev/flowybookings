import { createFileRoute } from "@tanstack/react-router";
import { ShopDashboardPage } from "@/shop/dashboard/ShopDashboardPage";

export const Route = createFileRoute("/shop/")({
  head: () => ({ meta: [{ title: "Dashboard — FlowyBookings" }] }),
  component: ShopDashboardPage,
});
