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

/** Requires super_admin role. Strictly blocks non-admins. */
export function RequireSuperAdmin({ children }: { children: ReactNode }) {
  const { session, loading, rolesLoading, isPlatformAdmin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || rolesLoading) return;
    if (!session) {
      // Send to dedicated admin login, never the shop login.
      navigate({ to: "/beheer/ad/login", replace: true });
      return;
    }
    if (!isPlatformAdmin) {
      // Non-admin with a session: bounce to homepage. Do NOT keep them here.
      navigate({ to: "/", replace: true });
    }
  }, [session, loading, rolesLoading, isPlatformAdmin, navigate]);

  if (loading || rolesLoading) return <FullPageLoader />;
  if (!session || !isPlatformAdmin) return <FullPageLoader label="Checking access…" />;
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
  // No linked shop yet → send them to the branded onboarding flow
  // instead of a dead-end screen. ShopOnboarding handles shop creation,
  // owner role assignment, and trial start (via DB trigger).
  if (!allowed) {
    return <NoShopAccessOnboardingPrompt />;
  }
  return <>{children}</>;
}

function NoShopAccessOnboardingPrompt() {
  const navigate = useNavigate();
  // Auto-redirect to the existing onboarding route which renders <ShopOnboarding />
  useEffect(() => {
    navigate({ to: "/shop/onboarding", replace: true });
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-hero px-4">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-elevated">
        <h1 className="text-2xl font-semibold tracking-tight">Welkom bij FlowyBookings</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Maak je shop aan om je dashboard te starten.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => navigate({ to: "/shop/onboarding", replace: true })}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-gradient-brand px-4 text-sm font-medium text-primary-foreground shadow-elevated transition-opacity hover:opacity-90"
          >
            Maak je shop aan
          </button>
          <button
            type="button"
            onClick={() => navigate({ to: "/", replace: true })}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-muted"
          >
            Terug naar homepage
          </button>
        </div>
      </div>
    </div>
  );
}
