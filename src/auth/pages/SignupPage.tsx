import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Sparkle,
  Loader2,
  CheckCircle2,
  ArrowRight,
  Mail,
  Eye,
  EyeOff,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/shared/lib/i18n";
import { LanguageSwitcher } from "@/shared/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { recordConsent } from "@/site/lib/legal-consent";
import { GoogleSignInButton } from "@/auth/components/GoogleSignInButton";
import { useGoogleAuthAvailable } from "@/auth/lib/use-google-auth-available";

type SignupStatus = "form" | "check_email" | "account_exists";

function isDuplicateSignupError(error: { message?: string; code?: string }): boolean {
  const msg = (error.message || "").toLowerCase();
  const code = (error.code || "").toLowerCase();
  return (
    code === "user_already_exists" ||
    code === "email_exists" ||
    msg.includes("already registered") ||
    msg.includes("already exists") ||
    msg.includes("user already") ||
    msg.includes("duplicate")
  );
}

/**
 * With "Confirm email" enabled, Supabase does not throw for an existing
 * confirmed user — it returns a fake user with an empty identities array.
 * See: https://supabase.com/docs/reference/javascript/auth-signup
 */
function isObfuscatedExistingUser(user: { identities?: unknown[] | null } | null): boolean {
  return !!user && Array.isArray(user.identities) && user.identities.length === 0;
}

export function SignupPage() {
  const navigate = useNavigate();
  const { t } = useT();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [status, setStatus] = useState<SignupStatus>("form");
  const googleAvailable = useGoogleAuthAvailable();

  const showAccountExists = () => {
    setStatus("account_exists");
    toast.error(t("auth.emailExistsTitle"), {
      description: t("auth.emailExistsBody"),
      action: {
        label: t("auth.goToLogin"),
        onClick: () => navigate({ to: "/login", search: { redirect: undefined } }),
      },
      duration: 10000,
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!agreed) {
      toast.error(t("auth.mustAgree"));
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/shop`,
          data: { full_name: fullName },
        },
      });
      if (error) {
        if (isDuplicateSignupError(error)) {
          showAccountExists();
          return;
        }
        throw error;
      }

      // Confirmed account already exists — obfuscated success payload.
      if (isObfuscatedExistingUser(data.user)) {
        showAccountExists();
        return;
      }

      const userId = data.user?.id;
      if (!userId) throw new Error("Account aanmaken mislukt");

      // Best-effort consent stamp (may fail without a session when confirm-email is on).
      void (async () => {
        for (let i = 0; i < 5; i++) {
          try {
            await recordConsent(userId);
            break;
          } catch {
            await new Promise((r) => setTimeout(r, 250));
          }
        }
      })();

      // New signup or unconfirmed account (confirmation email sent / resent).
      setStatus("check_email");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Aanmelden mislukt");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (!email.trim() || resending) return;
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/shop` },
      });
      if (error) throw error;
      toast.success(t("auth.checkEmailResent"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Aanmelden mislukt");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-hero px-4 py-12">
      <div className="w-full max-w-lg">
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
          {status === "check_email" ? (
            <>
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
                <Mail className="h-6 w-6" />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">{t("auth.checkEmailTitle")}</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("auth.checkEmailBody", { email })}
              </p>
              <div className="mt-6 flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <p className="text-sm text-muted-foreground">{t("auth.checkEmailHint")}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="mt-4 w-full"
                disabled={resending}
                onClick={handleResend}
              >
                {resending && <Loader2 className="h-4 w-4 animate-spin" />}
                {resending ? t("auth.checkEmailResending") : t("auth.checkEmailResend")}
              </Button>
              <Link
                to="/login"
                className="mt-4 inline-flex w-full items-center justify-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                {t("auth.backToSignIn")} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </>
          ) : status === "account_exists" ? (
            <>
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertCircle className="h-6 w-6" />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {t("auth.accountExistsTitle")}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("auth.accountExistsBody", { email })}
              </p>
              <Button
                type="button"
                variant="hero"
                className="mt-6 w-full"
                onClick={() => navigate({ to: "/login", search: { redirect: undefined } })}
              >
                {t("auth.goToLogin")} <ArrowRight className="h-4 w-4" />
              </Button>
              <Link
                to="/auth/forgot-password"
                className="mt-3 inline-flex w-full items-center justify-center text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                {t("auth.forgotPasswordCta")}
              </Link>
              <button
                type="button"
                className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
                onClick={() => setStatus("form")}
              >
                {t("auth.createAnAccount")}
              </button>
            </>
          ) : (
            <>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
                <Sparkle className="h-3.5 w-3.5" />
                {t("auth.trialBadge")}
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">{t("auth.startTrialTitle")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t("auth.trialLine")}</p>

              <ul className="mt-4 space-y-1.5 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success-foreground" />{" "}
                  {t("auth.benefitNoCard")}
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success-foreground" />{" "}
                  {t("auth.benefitFullAccess")}
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success-foreground" />{" "}
                  {t("auth.benefitCancelAnytime")}
                </li>
              </ul>

              {googleAvailable !== false && (
                <div className="mt-6 space-y-3">
                  <GoogleSignInButton />
                  {googleAvailable && (
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <div className="h-px flex-1 bg-border" />
                      {t("auth.orContinueWith")}
                      <div className="h-px flex-1 bg-border" />
                    </div>
                  )}
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name">{t("auth.fullName")}</Label>
                  <Input
                    id="name"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
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
                <div className="space-y-1.5">
                  <Label htmlFor="password">{t("auth.password")}</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground"
                      aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">{t("auth.minChars")}</p>
                </div>
                <label className="flex items-start gap-2.5 text-xs text-muted-foreground">
                  <Checkbox
                    checked={agreed}
                    onCheckedChange={(v) => setAgreed(v === true)}
                    className="mt-0.5"
                    aria-label={t("auth.mustAgree")}
                  />
                  <span>
                    {t("auth.agreePrefix")}{" "}
                    <Link to="/legal/terms" className="font-medium text-primary hover:underline">
                      {t("auth.termsLink")}
                    </Link>{" "}
                    {t("auth.and")}{" "}
                    <Link to="/legal/privacy" className="font-medium text-primary hover:underline">
                      {t("auth.privacyLink")}
                    </Link>
                  </span>
                </label>
                <Button
                  type="submit"
                  variant="hero"
                  className="w-full"
                  disabled={submitting || !agreed}
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t("auth.createBtn")}
                </Button>
              </form>

              <div className="mt-6 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
                {t("auth.haveAccount")}{" "}
                <Link
                  to="/login"
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                >
                  {t("auth.signIn")} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
