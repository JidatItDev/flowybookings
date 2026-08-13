import { createFileRoute } from "@tanstack/react-router";
import { AdminCustomersPage } from "@/admin/customers/CustomersPage";

export const Route = createFileRoute("/beheer/dashboard/customers")({
  head: () => ({ meta: [{ title: "Klanten — Platform" }] }),
  component: AdminCustomersPage,
});
