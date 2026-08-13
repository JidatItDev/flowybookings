import { createFileRoute } from "@tanstack/react-router";
import { usePermissions } from "@/shop/billing/use-permissions";
import { ShopBillingCard, usePlanCheckout } from "@/shop/billing/ShopBillingCard";
import { TransactionFeesCard } from "@/shop/billing/TransactionFeesCard";
import { usePlanPricing, planMonthlyAmount } from "@/shop/billing/use-plan-pricing";
import { UpgradePage } from "@/shop/billing/UpgradePage";

export const Route = createFileRoute("/shop/upgrade")({
  head: () => ({ meta: [{ title: "Upgrade — FlowyBookings" }] }),
  validateSearch: (search: Record<string, unknown>): { billing?: string; payment?: string } => {
    const out: { billing?: string; payment?: string } = {};
    if (typeof search.billing === "string") out.billing = search.billing;
    if (typeof search.payment === "string") out.payment = search.payment;
    return out;
  },
  component: UpgradePage,
});
