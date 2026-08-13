import { createFileRoute } from "@tanstack/react-router";
import { ProvidersPage } from "@/admin/providers/ProvidersPage";

export const Route = createFileRoute("/beheer/dashboard/providers")({
  head: () => ({ meta: [{ title: "Booking Payment Providers — Platform" }] }),
  component: ProvidersPage,
});
