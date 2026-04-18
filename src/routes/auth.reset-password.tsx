import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Sparkle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth/reset-password")({
  head: () => ({ meta: [{ title: "Reset password — FlowyBookings" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);
  const [linkInvalid, setLinkInvalid] = useState(false);

  // Supabase puts a recovery token in the URL hash and exchanges it for a session
  // via onAuthStateChange("PASSWORD_RECOVERY"). We just wait for that event.
  useEffect(() => {
    let cancelled = false;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        if (!cancelled) setReady(true);
      }
    });
    // Also check existing session in case the event fired before mount.
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) {
        setReady(true);
      } else {
        // Give the hash exchange a moment, then mark invalid if still no session.
        setTimeout(() => {
          if (!cancelled) {
            supabase.auth.getSession().then(({ data: d2 }) => {
              if (!cancelled && !d2.session) setLinkInvalid(true);
            });
          }
        }, 1500);
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error(t("auth.passwordTooShort"));
      return;
    }
    if (password !== confirm) {
      toast.error(t("auth.passwordsDontMatch"));
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("auth.passwordUpdated"));
    navigate({ to: "/login", replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-hero px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-brand">
              <Sparkle className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold tracking-tight">FlowyBookings</span>
          </Link>
          <LanguageSwitcher />
        </div>

        <div className="rounded-3xl border border-border bg-card p-8 shadow-elevated">
          <h1 className="text-2xl font-semibold tracking-tight">{t("auth.resetTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("auth.resetSub")}</p>

          {linkInvalid ? (
            <div className="mt-6 space-y-4">
              <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                {t("auth.invalidResetLink")}
              </p>
              <Link
                to="/auth/forgot-password"
                className="block text-center text-sm font-medium text-primary hover:underline"
              >
                {t("auth.forgotTitle")}
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="password">{t("auth.newPassword")}</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={!ready}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm">{t("auth.confirmPassword")}</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  disabled={!ready}
                />
              </div>
              <Button
                type="submit"
                variant="hero"
                className="w-full"
                disabled={submitting || !ready}
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitting ? t("auth.updating") : t("auth.updatePassword")}
              </Button>
              <Link
                to="/login"
                className="block text-center text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                {t("auth.backToSignIn")}
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
