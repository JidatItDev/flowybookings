import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Sparkle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { seedDemoUsers } from "@/lib/seed-demo-users";

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>) => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
  }),
  head: () => ({ meta: [{ title: "Sign in — Bookly" }] }),
  component: LoginPage,
});

const DEMOS = [
  { labelKey: "auth.shopOwner", email: "owner@inkwell.app" },
  { labelKey: "auth.staff", email: "staff@inkwell.app" },
];
const DEMO_PASSWORD = "Demo1234!";

function LoginPage() {
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const { session, loading, isSuperAdmin } = useAuth();
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    if (loading || !session) return;
    if (redirect) navigate({ to: redirect });
    else navigate({ to: isSuperAdmin ? "/beheer/dashboard" : "/shop" });
  }, [session, loading, isSuperAdmin, redirect, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) toast.error(error.message);
    else toast.success(t("auth.welcomeBackToast"));
  };

  const fillDemo = (demoEmail: string) => { setEmail(demoEmail); setPassword(DEMO_PASSWORD); };

  const runSeed = async () => {
    setSeeding(true);
    try { await seedDemoUsers(); toast.success(t("auth.demoReady")); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Failed to seed"); }
    finally { setSeeding(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-hero px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-brand">
              <Sparkle className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold tracking-tight">Bookly</span>
          </Link>
          <LanguageSwitcher />
        </div>

        <div className="rounded-3xl border border-border bg-card p-8 shadow-elevated">
          <h1 className="text-2xl font-semibold tracking-tight">{t("auth.welcomeBack")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("auth.signInSub")}</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">{t("auth.password_label")}</Label>
              <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" variant="hero" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("auth.signInBtn")}
            </Button>
          </form>

          <div className="mt-5 text-center text-sm text-muted-foreground">
            {t("auth.newHere")}{" "}
            <Link to="/signup" className="font-medium text-primary hover:underline">{t("auth.createAnAccount")}</Link>
          </div>

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> {t("auth.demoAccounts")}
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="space-y-2">
            {DEMOS.map((d) => (
              <button key={d.email} type="button" onClick={() => fillDemo(d.email)} className="flex w-full items-center justify-between rounded-xl border border-border bg-muted/40 px-3 py-2 text-left text-xs hover:bg-muted">
                <span className="font-medium">{t(d.labelKey)}</span>
                <span className="font-mono text-muted-foreground">{d.email}</span>
              </button>
            ))}
            <p className="text-[11px] text-muted-foreground">
              {t("auth.password_label")}: <code className="font-mono">{DEMO_PASSWORD}</code> · {t("auth.firstTime")}{" "}
              <button type="button" onClick={runSeed} disabled={seeding} className="font-medium text-primary hover:underline disabled:opacity-60">
                {seeding ? t("auth.seeding") : t("auth.provisionDemo")}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
