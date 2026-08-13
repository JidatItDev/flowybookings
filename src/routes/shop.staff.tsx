import { createFileRoute } from "@tanstack/react-router";
import { StaffPage } from "@/shop/staff/StaffPage";

export const Route = createFileRoute("/shop/staff")({ head: () => ({ meta: [{ title: "Staff — FlowyBookings" }] }), component: StaffPage });
