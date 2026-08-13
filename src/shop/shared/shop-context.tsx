// Thin compatibility shim around AuthProvider so existing pages
// (useActiveShopId, useShopContext) keep working unchanged.

import { useAuth, type ShopRow } from "@/auth/lib/auth-context";

export type { ShopRow };

export function useShopContext() {
  const { shops, activeShop, activeShopId, setActiveShopId, loading } = useAuth();
  return {
    shops,
    activeShop,
    activeShopId,
    setActiveShopId,
    isLoading: loading,
  };
}

export function useActiveShopId(): string | null {
  return useAuth().activeShopId;
}
