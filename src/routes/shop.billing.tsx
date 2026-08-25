import { createFileRoute } from "@tanstack/react-router";
import { UpgradePage } from "@/shop/billing/UpgradePage";

export const Route = createFileRoute("/shop/billing")({
  head: () => ({ meta: [{ title: "Billing — FlowyBookings" }] }),
  validateSearch: (search: Record<string, unknown>): { billing?: string; payment?: string } => {
    const out: { billing?: string; payment?: string } = {};
    if (typeof search.billing === "string") out.billing = search.billing;
    if (typeof search.payment === "string") out.payment = search.payment;
    return out;
  },
  component: UpgradePage,
});
