import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ShopOnboarding } from "@/shop/onboarding/ShopOnboarding";
import { RequireAuth, FullPageLoader } from "@/auth/components/RouteGuard";
import { ImpersonationBanner } from "@/admin/impersonation/ImpersonationBanner";
import { useAuth } from "@/auth/lib/auth-context";

export function ShopOnboardingPage() {
  return (
    <RequireAuth>
      <OnboardingInner />
    </RequireAuth>
  );
}

function OnboardingInner() {
  const { shops, loading, shopsLoading, isSuperAdmin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || shopsLoading) return;
    if (isSuperAdmin || shops.length > 0) {
      navigate({ to: "/shop", replace: true });
    }
  }, [loading, shopsLoading, isSuperAdmin, shops, navigate]);

  if (loading || shopsLoading) {
    return <FullPageLoader />;
  }

  if (isSuperAdmin || shops.length > 0) {
    return <FullPageLoader label="Redirecting…" />;
  }

  return (
    <div className="min-h-screen bg-background">
      <ImpersonationBanner />
      <ShopOnboarding />
    </div>
  );
}
