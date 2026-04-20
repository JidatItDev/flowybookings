// Auth + role + active-shop context for the entire app.
// Replaces the old dev-mode shop selector.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "super_admin" | "shop_owner" | "staff" | "customer";

export type ShopRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
  plan_expires_at: string | null;
  plan_billing_cycle: string | null;
  onboarding: Record<string, unknown> | null;
  policy_accepted_at: string | null;
  policy_version: string | null;
};

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  roles: AppRole[];
  rolesLoading: boolean;
  isSuperAdmin: boolean;
  isShopOwner: boolean;
  isStaff: boolean;
  shops: ShopRow[];
  activeShop: ShopRow | null;
  activeShopId: string | null;
  setActiveShopId: (id: string) => void;
  signOut: () => Promise<void>;
  refreshShops: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const ACTIVE_SHOP_KEY = "flowybookings:active-shop-id";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeShopId, setActiveShopIdState] = useState<string | null>(null);
  const qc = useQueryClient();

  // Subscribe FIRST, then read existing session — order matters for race-free hydration.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      // Reset cached per-user data when auth changes
      qc.invalidateQueries();
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, [qc]);

  const userId = session?.user?.id ?? null;

  // Roles
  const { data: roles = [], isLoading: rolesQueryLoading, isFetching: rolesFetching } = useQuery({
    queryKey: ["auth", "roles", userId],
    enabled: !!userId,
    queryFn: async (): Promise<AppRole[]> => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId!);
      if (error) throw error;
      return (data ?? []).map((r) => r.role as AppRole);
    },
  });
  // While there's a session, treat roles as "loading" until the query has resolved at least once.
  const rolesLoading = !!userId && (rolesQueryLoading || rolesFetching);

  // Shops the user can access (owner or any role)
  const { data: shops = [] } = useQuery({
    queryKey: ["auth", "shops", userId],
    enabled: !!userId,
    queryFn: async (): Promise<ShopRow[]> => {
      // Super admin sees all shops; everyone else sees shops via RLS (owner + role).
      const { data, error } = await supabase
        .from("shops")
        .select("id, name, slug, status, plan, plan_expires_at, plan_billing_cycle, onboarding, policy_accepted_at, policy_version")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ShopRow[];
    },
  });

  // Hydrate active shop id (client-only) from localStorage or first available
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!userId) {
      setActiveShopIdState(null);
      return;
    }
    if (activeShopId && shops.some((s) => s.id === activeShopId)) return;
    if (shops.length === 0) {
      setActiveShopIdState(null);
      return;
    }
    const stored = window.localStorage.getItem(ACTIVE_SHOP_KEY);
    const next = stored && shops.some((s) => s.id === stored) ? stored : shops[0].id;
    setActiveShopIdState(next);
  }, [shops, userId, activeShopId]);

  const setActiveShopId = (id: string) => {
    setActiveShopIdState(id);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ACTIVE_SHOP_KEY, id);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(ACTIVE_SHOP_KEY);
    }
    setActiveShopIdState(null);
  };

  const refreshShops = () => {
    qc.invalidateQueries({ queryKey: ["auth", "shops"] });
  };

  const value = useMemo<AuthContextValue>(() => {
    const activeShop = shops.find((s) => s.id === activeShopId) ?? null;
    const isSuperAdmin = roles.includes("super_admin");
    return {
      session,
      user: session?.user ?? null,
      loading,
      roles,
      rolesLoading,
      isSuperAdmin,
      // A super_admin sees all shops via RLS — don't mistake that for shop ownership.
      isShopOwner: !isSuperAdmin && (roles.includes("shop_owner") || (session?.user?.id != null && shops.length > 0)),
      isStaff: roles.includes("staff"),
      shops,
      activeShop,
      activeShopId,
      setActiveShopId,
      signOut,
      refreshShops,
    };
  }, [session, loading, roles, rolesLoading, shops, activeShopId, qc]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
