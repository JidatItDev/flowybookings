import { createFileRoute } from "@tanstack/react-router";
import { AdminSupportPage } from "@/admin/support/SupportPage";

export const Route = createFileRoute("/beheer/dashboard/support")({ head: () => ({ meta: [{ title: "Support — Admin" }] }), component: AdminSupportPage });
