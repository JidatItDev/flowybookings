import { createFileRoute } from "@tanstack/react-router";
import { AdminDashboardPage } from "@/admin/dashboard/DashboardPage";

export const Route = createFileRoute("/beheer/dashboard/")({ head: () => ({ meta: [{ title: "Platform overview — FlowyBookings" }] }), component: AdminDashboardPage });
