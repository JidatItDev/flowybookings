// Client-side route guards. Used inside route components instead of
// beforeLoad because our auth state lives in React context (Supabase session).

import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { Loader2 } from "lucide-react";

function FullPageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex items-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">{label}</span>
      </div>
    </div>
  );
}

/** Requires an authenticated session. Redirects to /login. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) {
      navigate({ to: "/login", search: { redirect: window.location.pathname } });
    }
  }, [session, loading, navigate]);

  if (loading) return <FullPageLoader />;
  if (!session) return <FullPageLoader label="Redirecting…" />;
  return <>{children}</>;
}

/** Requires super_admin role. Redirects non-admins to /shop. */
export function RequireSuperAdmin({ children }: { children: ReactNode }) {
  const { session, loading, roles, isSuperAdmin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate({ to: "/login", search: { redirect: window.location.pathname } });
      return;
    }
    // Wait for roles to load (empty roles + loaded session = still fetching or no roles)
    if (roles.length === 0) return;
    if (!isSuperAdmin) {
      navigate({ to: "/shop" });
    }
  }, [session, loading, roles, isSuperAdmin, navigate]);

  if (loading || !session) return <FullPageLoader />;
  if (!isSuperAdmin) return <FullPageLoader label="Checking access…" />;
  return <>{children}</>;
}

/** Requires shop access (owner, staff, or super admin). */
export function RequireShopAccess({ children }: { children: ReactNode }) {
  const { session, loading, isSuperAdmin, isShopOwner, isStaff } = useAuth();
  const navigate = useNavigate();
  const allowed = isSuperAdmin || isShopOwner || isStaff;

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate({ to: "/login", search: { redirect: window.location.pathname } });
    }
  }, [session, loading, navigate]);

  if (loading || !session) return <FullPageLoader />;
  // Customers (no role) get bounced to landing
  if (!allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold">No shop access</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account isn't linked to a shop yet.
          </p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
