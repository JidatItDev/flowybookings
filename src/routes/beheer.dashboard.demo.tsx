import { createFileRoute } from "@tanstack/react-router";
import { AdminDemoPage } from "@/admin/demo/DemoPage";

export const Route = createFileRoute("/beheer/dashboard/demo")({
  head: () => ({ meta: [{ title: "Demo controls — FlowyBookings Admin" }] }),
  component: AdminDemoPage,
});
