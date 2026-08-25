// Alias of /shop/billing (the canonical route) so old links to /shop/upgrade keep working.
import { createFileRoute } from "@tanstack/react-router";
import { Route as BillingRoute } from "./shop.billing";

function ShopUpgradeAlias() {
  const Component = BillingRoute.options.component;
  if (!Component) return null;
  return <Component />;
}

export const Route = createFileRoute("/shop/upgrade")({
  head: () => ({ meta: [{ title: "Billing — FlowyBookings" }] }),
  validateSearch: (search: Record<string, unknown>): { billing?: string; payment?: string } => {
    const out: { billing?: string; payment?: string } = {};
    if (typeof search.billing === "string") out.billing = search.billing;
    if (typeof search.payment === "string") out.payment = search.payment;
    return out;
  },
  component: ShopUpgradeAlias,
});
