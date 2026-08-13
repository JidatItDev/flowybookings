import { createFileRoute } from "@tanstack/react-router";
import { useFeatureAccess } from "@/shop/billing/use-feature-access";
import { usePlanPricing, formatPlanPrice } from "@/shop/billing/use-plan-pricing";
import { usePendingBilling } from "@/shop/billing/use-pending-billing";
import { SettingsPage } from "@/shop/settings/SettingsPage";

export const Route = createFileRoute("/shop/settings")({
  head: () => ({ meta: [{ title: "Settings — FlowyBookings" }] }),
  validateSearch: (search: Record<string, unknown>): { billing?: string; payment?: string } => {
    const out: { billing?: string; payment?: string } = {};
    if (typeof search.billing === "string") out.billing = search.billing;
    if (typeof search.payment === "string") out.payment = search.payment;
    return out;
  },
  component: SettingsPage,
});
