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
  component: ShopBillingAlias,
});
