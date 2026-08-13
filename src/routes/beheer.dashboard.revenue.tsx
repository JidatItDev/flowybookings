import { createFileRoute } from "@tanstack/react-router";
import { RevenuePage } from "@/admin/revenue/RevenuePage";

export const Route = createFileRoute("/beheer/dashboard/revenue")({
  head: () => ({ meta: [{ title: "Inkomsten — Platform" }] }),
  component: RevenuePage,
});
