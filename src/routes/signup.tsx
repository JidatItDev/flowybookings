import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Sparkle, Loader2, CheckCircle2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { recordConsent } from "@/lib/legal-consent";
import { logActivity } from "@/lib/activity-log";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { useGoogleAuthAvailable } from "@/lib/use-google-auth-available";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Create account — FlowyBookings" }] }),
  component: SignupPage,
});

const CATEGORIES = [
  { value: "kapper", label: "Kapper" },
  { value: "barber", label: "Barber" },
  { value: "nails", label: "Nagelsalon" },
  { value: "beauty", label: "Beauty / Schoonheid" },
  { value: "tattoo", label: "Tattoo / Piercing" },
  { value: "trimsalon", label: "Trimsalon" },
  { value: "massage", label: "Massage / Wellness" },
  { value: "other", label: "Anders" },
];

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "salon";
}

async function uniqueSlug(base: string): Promise<string> {
  let candidate = base;
  for (let i = 0; i < 6; i++) {
    const { data } = await supabase.from("shops").select("id").eq("slug", candidate).maybeSingle();
    if (!data) return candidate;
    candidate = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

function SignupPage() {
  const navigate = useNavigate();
  const { session, loading, refreshShops, setActiveShopId } = useAuth();
  const { t } = useT();
  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [category, setCategory] = useState("kapper");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Don't auto-redirect after signup; we navigate explicitly to the new shop.
  useEffect(() => { if (!loading && session && !submitting) {/* idle */} }, [session, loading, submitting]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!agreed) { toast.error(t("auth.mustAgree")); return; }
    if (!businessName.trim()) { toast.error("Bedrijfsnaam is verplicht"); return; }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: `${window.location.origin}/shop`, data: { full_name: fullName } },
      });
      if (error) {
        // Detect duplicate-email error coming back from Supabase auth.
        const msg = (error.message || "").toLowerCase();
        const isDuplicate =
          msg.includes("already registered") ||
          msg.includes("already exists") ||
          msg.includes("user already") ||
          msg.includes("duplicate");
        if (isDuplicate) {
          toast.error(t("auth.emailExistsTitle"), {
            description: t("auth.emailExistsBody"),
            action: {
              label: t("auth.goToLogin"),
              onClick: () => navigate({ to: "/login", search: { redirect: undefined } }),
            },
            duration: 10000,
          });
          return;
        }
        throw error;
      }
      const userId = data.user?.id;
      if (!userId) throw new Error("Account aanmaken mislukt");

      // Record consent (best-effort)
      void (async () => {
        for (let i = 0; i < 5; i++) {
          try { await recordConsent(userId); break; } catch { await new Promise((r) => setTimeout(r, 250)); }
        }
      })();

      // Create the user's own shop. Demo shops are seeded separately and must
      // never be used for new signups.
      const baseSlug = slugify(businessName);
      const slug = await uniqueSlug(baseSlug);
      const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

      const { data: shop, error: shopErr } = await supabase
        .from("shops")
        .insert({
          owner_id: userId,
          name: businessName.trim(),
          slug,
          plan: "trial",
          status: "active",
          plan_expires_at: trialEnd,
          subscription_status: "trial",
          category,
          is_demo: false,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Amsterdam",
        })
        .select("id")
        .single();
      if (shopErr) throw shopErr;

      // Make sure the user has the shop_owner role.
      await supabase.from("user_roles").insert({ user_id: userId, role: "shop_owner", shop_id: shop.id });

      // Admin onboarding-funnel: log shop_created.
      void logActivity({
        entity: "shop",
        action: "shop_created",
        shopId: shop.id,
        metadata: { shop_name: businessName.trim(), category, plan: "trial" },
      });

      refreshShops();
      setActiveShopId(shop.id);
      toast.success(t("auth.accountCreated"));
      navigate({ to: "/shop" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Aanmelden mislukt");
    } finally {
      setSubmitting(false);
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
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
            <Sparkle className="h-3.5 w-3.5" />
            {t("auth.trialBadge")}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("auth.startTrialTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("auth.trialLine")}</p>

          <ul className="mt-4 space-y-1.5 text-sm text-muted-foreground">
            <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success-foreground" /> {t("auth.benefitNoCard")}</li>
            <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success-foreground" /> {t("auth.benefitFullAccess")}</li>
            <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success-foreground" /> {t("auth.benefitCancelAnytime")}</li>
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
              <Input id="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="business">Bedrijfsnaam</Label>
              <Input id="business" required value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Bijv. Salon Bloem" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="category">Type zaak</Label>
              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">{t("auth.password")}</Label>
              <Input id="password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
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
                <Link to="/legal/terms" className="font-medium text-primary hover:underline">{t("auth.termsLink")}</Link>{" "}
                {t("auth.and")}{" "}
                <Link to="/legal/privacy" className="font-medium text-primary hover:underline">{t("auth.privacyLink")}</Link>
              </span>
            </label>
            <Button type="submit" variant="hero" className="w-full" disabled={submitting || !agreed}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("auth.createBtn")}
            </Button>
          </form>

          <div className="mt-6 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
            {t("auth.haveAccount")}{" "}
            <Link to="/login" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
              {t("auth.signIn")} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
