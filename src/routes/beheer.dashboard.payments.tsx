import { createFileRoute } from "@tanstack/react-router";
import { AdminPaymentsPage } from "@/admin/payments/PaymentsPage";

export const Route = createFileRoute("/beheer/dashboard/payments")({ head: () => ({ meta: [{ title: "Payments — Platform" }] }), component: AdminPaymentsPage });
