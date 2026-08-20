// Alias of /shop/upgrade so links to /shop/billing keep working.
// Subscription billing only — booking payments live at /shop/payments.
import { createFileRoute } from "@tanstack/react-router";
import { Route as UpgradeRoute } from "./shop.upgrade";

function ShopBillingAlias() {
  const Component = UpgradeRoute.options.component;
  if (!Component) return null;
  return <Component />;
}

export const Route = createFileRoute("/shop/billing")({
  head: () => ({ meta: [{ title: "Billing — FlowyBookings" }] }),
  validateSearch: (search: Record<string, unknown>): { billing?: string; payment?: string } => {
    const out: { billing?: string; payment?: string } = {};
    if (typeof search.billing === "string") out.billing = search.billing;
    if (typeof search.payment === "string") out.payment = search.payment;
    return out;
  },
  component: ShopBillingAlias,
});
