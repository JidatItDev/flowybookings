import { createFileRoute } from "@tanstack/react-router";
import { ShopOnboardingPage } from "@/shop/onboarding/ShopOnboardingPage";

export const Route = createFileRoute("/shop/onboarding")({
  head: () => ({ meta: [{ title: "Salon instellen — FlowyBookings" }] }),
  component: ShopOnboardingPage,
});
