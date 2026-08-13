import { createFileRoute } from "@tanstack/react-router";
import { CustomersPage } from "@/shop/customers/CustomersPage";

export const Route = createFileRoute("/shop/customers")({
  head: () => ({ meta: [{ title: "Customers — FlowyBookings" }] }),
  component: CustomersPage,
});
