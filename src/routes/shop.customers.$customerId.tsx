import { createFileRoute } from "@tanstack/react-router";
import { CustomerDetailPage } from "@/shop/customers/CustomerDetailPage";

export const Route = createFileRoute("/shop/customers/$customerId")({
  head: () => ({ meta: [{ title: "Customer profile — FlowyBookings" }] }),
  component: CustomerDetailPage,
});
