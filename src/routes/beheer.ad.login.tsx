import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ShieldCheck, Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/beheer/ad/login")({
  head: () => ({ meta: [{ title: "Platform login" }] }),
  component: AdminLoginPage,
});

function AdminLoginPage() {
  const navigate = useNavigate();
  const { session, loading, rolesLoading, isPlatformAdmin, signOut } = useAuth();
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading || rolesLoading || !session) return;
    if (isPlatformAdmin) navigate({ to: "/beheer/dashboard", replace: true });
  }, [session, loading, rolesLoading, isPlatformAdmin, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    if (session) await supabase.auth.signOut();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) {
      void supabase.from("admin_login_log").insert({
        email, success: false, failure_reason: error.message?.slice(0, 200) ?? "unknown",
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null,
      });
      toast.error(error.message);
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) {
      toast.error(t("errors.authFailed"));
      return;
    }
    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("role, disabled_at, expires_at")
      .eq("user_id", uid)
      .in("role", ["super_admin", "admin", "support", "read_only_admin"]);
    const active = (roleRows ?? []).find(
      (r) => !r.disabled_at && (!r.expires_at || new Date(r.expires_at) > new Date()),
    );
    if (!active) {
      await supabase.auth.signOut();
      void supabase.from("admin_login_log").insert({
        user_id: uid, email, success: false, failure_reason: "not_platform_admin_or_expired",
      });
      toast.error(t("admin.notAuthorized") ?? "This account is not a platform admin.");
      return;
    }
    void supabase.from("admin_login_log").insert({
      user_id: uid, email, role: active.role, success: true,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null,
    });
    navigate({ to: "/beheer/dashboard", replace: true });
  };

  const blocked = !!session && !rolesLoading && !isPlatformAdmin;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          </div>
          <LanguageSwitcher />
        </div>

        <div className="rounded-2xl border border-border bg-card p-8 shadow-soft">
          <h1 className="text-lg font-semibold tracking-tight">{t("admin.platformAccess")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("admin.authorizedOnly")}</p>

          {blocked ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                You are signed in as <span className="font-medium">{session?.user?.email}</span>, which is not a platform admin account. Sign out to continue.
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={async () => {
                  await signOut();
                  navigate({ to: "/beheer/ad/login", replace: true });
                }}
              >
                <LogOut className="h-4 w-4" /> Sign out
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => navigate({ to: "/" })}>
                Go to homepage
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="admin-email">{t("auth.email")}</Label>
                <Input id="admin-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="admin-password">{t("auth.password_label")}</Label>
                <Input id="admin-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={submitting || loading}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("admin.signIn")}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
