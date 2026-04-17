// Dev-mode shop context: lets the dashboard pick any shop in the DB.
// To be replaced by an auth-based shop selector once /login is wired up.

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ShopRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
};

const STORAGE_KEY = "bookly:active-shop-id";

interface ShopContextValue {
  shops: ShopRow[];
  activeShopId: string | null;
  activeShop: ShopRow | null;
  setActiveShopId: (id: string) => void;
  isLoading: boolean;
}

const ShopContext = createContext<ShopContextValue | null>(null);

export function ShopProvider({ children }: { children: ReactNode }) {
  const [activeShopId, setActiveShopIdState] = useState<string | null>(null);

  const { data: shops = [], isLoading } = useQuery({
    queryKey: ["shops", "all"],
    queryFn: async (): Promise<ShopRow[]> => {
      const { data, error } = await supabase
        .from("shops")
        .select("id, name, slug, status, plan")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Hydrate from localStorage / fall back to first shop, on the client only.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (activeShopId) return;
    if (shops.length === 0) return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const next = stored && shops.some((s) => s.id === stored) ? stored : shops[0].id;
    setActiveShopIdState(next);
  }, [shops, activeShopId]);

  const setActiveShopId = (id: string) => {
    setActiveShopIdState(id);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, id);
    }
  };

  const activeShop = shops.find((s) => s.id === activeShopId) ?? null;

  return (
    <ShopContext.Provider
      value={{ shops, activeShopId, activeShop, setActiveShopId, isLoading }}
    >
      {children}
    </ShopContext.Provider>
  );
}

export function useShopContext(): ShopContextValue {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error("useShopContext must be used within <ShopProvider>");
  return ctx;
}

/** Convenience: just the active shop id (or null while loading). */
export function useActiveShopId(): string | null {
  return useShopContext().activeShopId;
}
