import { createFileRoute } from "@tanstack/react-router";
import { BookingsPage } from "@/admin/bookings/BookingsPage";

export const Route = createFileRoute("/beheer/dashboard/bookings")({ head: () => ({ meta: [{ title: "Bookings — Platform" }] }), component: BookingsPage });
