import { createFileRoute } from "@tanstack/react-router";
import { AdminBillingPage } from "@/admin/billing/BillingPage";

export const Route = createFileRoute("/beheer/dashboard/billing")({
  head: () => ({ meta: [{ title: "Billing — Platform" }] }),
  component: AdminBillingPage,
});
