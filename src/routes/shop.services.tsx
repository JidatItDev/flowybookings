import { createFileRoute } from "@tanstack/react-router";
import { ServicesPage } from "@/shop/services/ServicesPage";

export const Route = createFileRoute("/shop/services")({ head: () => ({ meta: [{ title: "Services — FlowyBookings" }] }), component: ServicesPage });
