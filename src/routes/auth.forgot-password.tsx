import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkle, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth/forgot-password")({
  head: () => ({ meta: [{ title: "Forgot password — FlowyBookings" }] }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const redirectTo =
      typeof window !== "undefined" ? `${window.location.origin}/auth/reset-password` : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSent(true);
    toast.success(t("auth.resetEmailSent"));
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
          <h1 className="text-2xl font-semibold tracking-tight">{t("auth.forgotTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("auth.forgotSub")}</p>

          {sent ? (
            <div className="mt-6 space-y-4">
              <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" />
                <p className="text-sm">{t("auth.resetEmailSent")}</p>
              </div>
              <Link to="/login" className="block text-center text-sm font-medium text-primary hover:underline">
                {t("auth.backToSignIn")}
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">{t("auth.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button type="submit" variant="hero" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitting ? t("auth.sending") : t("auth.sendResetLink")}
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
