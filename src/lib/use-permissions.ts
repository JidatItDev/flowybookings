// Role + plan permission helpers used across shop UI.
// Keeps role/plan logic out of components.

import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { planAllows, requiredTierFor, tierOf, type Feature, type Tier } from "@/lib/plans";

export function usePermissions() {
  const { isSuperAdmin, isShopOwner, isStaff, activeShop } = useAuth();
  const plan = activeShop?.plan ?? "trial";

  return useMemo(() => {
    // Staff (and only staff) cannot manage billing/automation/payment provider/platform settings.
    // Super admins always can. Shop owners always can.
    const isStaffOnly = isStaff && !isShopOwner && !isSuperAdmin;

    return {
      plan,
      tier: tierOf(plan),
      isStaffOnly,
      canManageBilling: !isStaffOnly,
      canManageAutomation: !isStaffOnly,
      canManagePaymentProvider: !isStaffOnly,
      canManageShopSettings: !isStaffOnly,
      canManageStaff: !isStaffOnly,
      hasFeature: (f: Feature) => planAllows(plan, f),
      requiresUpgrade: (f: Feature): Tier | null =>
        planAllows(plan, f) ? null : requiredTierFor(f),
    };
  }, [isSuperAdmin, isShopOwner, isStaff, plan]);
}
