// Dedicated onboarding route for shop_owners without a shop yet
// (e.g. legacy accounts created before the auto-create-on-signup flow,
// or users who deleted their only shop). ShopLayout redirects here.

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ShopOnboarding } from "@/components/ShopOnboarding";
import { RequireAuth } from "@/components/RouteGuard";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/shop/onboarding")({
  head: () => ({ meta: [{ title: "Salon instellen — FlowyBookings" }] }),
  component: ShopOnboardingPage,
});

function ShopOnboardingPage() {
  return (
    <RequireAuth>
      <OnboardingInner />
    </RequireAuth>
  );
}

function OnboardingInner() {
  const { shops, loading, isSuperAdmin } = useAuth();
  const navigate = useNavigate();

  // If the user already has a shop (or is a super_admin), don't keep them
  // stuck on onboarding — bounce to the dashboard.
  useEffect(() => {
    if (loading) return;
    if (isSuperAdmin || shops.length > 0) {
      navigate({ to: "/shop", replace: true });
    }
  }, [loading, isSuperAdmin, shops, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <ImpersonationBanner />
      <ShopOnboarding />
    </div>
  );
}
