import { createFileRoute } from "@tanstack/react-router";
import { MollieConnectCard } from "@/shop/payments/MollieConnectCard";
import { MollieConnectPayments } from "@/shop/payments/MollieConnectPayments";
import { PaymentsPage } from "@/shop/payments/PaymentsPage";

export const Route = createFileRoute("/shop/payments")({
  head: () => ({ meta: [{ title: "Booking payments — FlowyBookings" }] }),
  component: PaymentsPage,
});
