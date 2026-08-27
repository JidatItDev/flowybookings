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

export type AppRole =
  | "super_admin"
  | "admin"
  | "support"
  | "read_only_admin"
  | "shop_owner"
  | "staff"
  | "customer";

export type ShopRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
  plan_expires_at: string | null;
  plan_billing_cycle: string | null;
  next_billing_at: string | null;
  subscription_status: string | null;
  payment_failed_at: string | null;
  pending_plan: string | null;
  pending_plan_effective_at: string | null;
  pending_billing_cycle: string | null;
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
  shopsLoading: boolean;
  isSuperAdmin: boolean;
  isPlatformAdmin: boolean;
  isAdminWriter: boolean;
  isReadOnlyAdmin: boolean;
  isSupportAdmin: boolean;
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
// Session lifetime (inactivity timeout + absolute timebox) is enforced
// server-side by Supabase Auth (Dashboard > Authentication > Sessions),
// not by client-side tracking.

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeShopId, setActiveShopIdState] = useState<string | null>(null);
  const qc = useQueryClient();

  // Subscribe FIRST, then read existing session — order matters for race-free hydration.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      // Identity changes only — never TOKEN_REFRESHED (that was remounting the whole shop).
      // Auth query keys include userId, so a different user is a cache miss and loads fresh.
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        qc.invalidateQueries({ queryKey: ["auth"] });
      }
      if (event === "SIGNED_IN" && s?.user?.id) {
        // Best-effort: stamp last_login_at on real sign-in so admins can see activity.
        const uid = s.user.id;
        const userEmail = s.user.email ?? null;
        setTimeout(() => {
          void supabase.from("profiles").update({ last_login_at: new Date().toISOString() }).eq("id", uid);
          // Best-effort: log the login attempt for the admin security page.
          void supabase.from("admin_login_log").insert({
            user_id: uid,
            email: userEmail,
            success: true,
            user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null,
          });
        }, 0);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, [qc]);

  const userId = session?.user?.id ?? null;

  // Roles
  const { data: roles = [], isLoading: rolesQueryLoading } = useQuery({
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
  // Initial load only (v5 isLoading = no data yet AND fetching). Background refetch must not gate the UI.
  const rolesLoading = !!userId && rolesQueryLoading;

  // Shops the user can access (owner OR explicit role membership).
  // CRITICAL: do NOT rely on RLS visibility of `shops` (which exposes all
  // active shops publicly for the booking pages) — otherwise demo shops would
  // leak into the dashboard context. We explicitly resolve membership via
  // owner_id + user_roles, so a brand-new signup never lands in a demo shop.
  const { data: shops = [], isLoading: shopsQueryLoading } = useQuery({
    queryKey: ["auth", "shops", userId],
    enabled: !!userId,
    queryFn: async (): Promise<ShopRow[]> => {
      // 1) Own shops (owner_id = user)
      const ownPromise = supabase
        .from("shops")
        .select("id, name, slug, status, plan, plan_expires_at, plan_billing_cycle, next_billing_at, subscription_status, pending_plan, pending_plan_effective_at, pending_billing_cycle, onboarding, policy_accepted_at, policy_version, owner_id, is_demo, created_at, payment_failed_at")
        .eq("owner_id", userId!);
      // 2) Shops the user has an explicit role on
      const rolesPromise = supabase
        .from("user_roles")
        .select("shop_id")
        .eq("user_id", userId!)
        .not("shop_id", "is", null);

      const [ownRes, rolesRes] = await Promise.all([ownPromise, rolesPromise]);
      if (ownRes.error) throw ownRes.error;
      if (rolesRes.error) throw rolesRes.error;

      const own = (ownRes.data ?? []) as (ShopRow & { owner_id: string; is_demo: boolean; created_at: string })[];
      const roleShopIds = (rolesRes.data ?? [])
        .map((r) => r.shop_id as string | null)
        .filter((v): v is string => !!v && !own.some((o) => o.id === v));

      let extra: (ShopRow & { owner_id: string; is_demo: boolean; created_at: string })[] = [];
      if (roleShopIds.length) {
        const { data, error } = await supabase
          .from("shops")
          .select("id, name, slug, status, plan, plan_expires_at, plan_billing_cycle, next_billing_at, subscription_status, pending_plan, pending_plan_effective_at, pending_billing_cycle, onboarding, policy_accepted_at, policy_version, owner_id, is_demo, created_at, payment_failed_at")
          .in("id", roleShopIds);
        if (error) throw error;
        extra = (data ?? []) as (ShopRow & { owner_id: string; is_demo: boolean; created_at: string })[];
      }

      const rows = [...own, ...extra];
      // Sort: own non-demo first, then own demo, then role-shops (non-demo first).
      rows.sort((a, b) => {
        const aOwn = a.owner_id === userId ? 0 : 1;
        const bOwn = b.owner_id === userId ? 0 : 1;
        if (aOwn !== bOwn) return aOwn - bOwn;
        const aDemo = a.is_demo ? 1 : 0;
        const bDemo = b.is_demo ? 1 : 0;
        if (aDemo !== bDemo) return aDemo - bDemo;
        const aT = new Date(a.created_at).getTime();
        const bT = new Date(b.created_at).getTime();
        return aT - bT;
      });
      return rows as ShopRow[];
    },
  });
  const shopsLoading = !!userId && shopsQueryLoading;

  // Hydrate active shop id from localStorage, but ONLY if the stored id is in
  // the user's resolved shops. Otherwise pick the first (= own non-demo) shop.
  // This guarantees a fresh signup never inherits a demo shop id from a
  // previous session in the same browser.
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
    if (next !== stored) {
      try { window.localStorage.setItem(ACTIVE_SHOP_KEY, next); } catch { /* ignore */ }
    }
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
    const isAdmin = roles.includes("admin");
    const isSupportAdmin = roles.includes("support");
    const isReadOnlyAdmin = roles.includes("read_only_admin");
    const isPlatformAdmin = isSuperAdmin || isAdmin || isSupportAdmin || isReadOnlyAdmin;
    const isAdminWriter = isSuperAdmin || isAdmin;
    return {
      session,
      user: session?.user ?? null,
      loading,
      roles,
      rolesLoading,
      shopsLoading,
      isSuperAdmin,
      isPlatformAdmin,
      isAdminWriter,
      isReadOnlyAdmin,
      isSupportAdmin,
      // A super_admin sees all shops via RLS — don't mistake that for shop ownership.
      isShopOwner: !isPlatformAdmin && (roles.includes("shop_owner") || (session?.user?.id != null && shops.length > 0)),
      isStaff: roles.includes("staff"),
      shops,
      activeShop,
      activeShopId,
      setActiveShopId,
      signOut,
      refreshShops,
    };
  }, [session, loading, roles, rolesLoading, shopsLoading, shops, activeShopId, qc]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
