import { useState, useEffect, useMemo, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkle, Loader2, Check, X, ArrowRight, ArrowLeft, CalendarCheck, Bell, Users, BarChart3, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/auth/lib/auth-context";
import { useT } from "@/shared/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { FullPageLoader } from "@/auth/components/RouteGuard";
import { LanguageSwitcher } from "@/shared/components/LanguageSwitcher";
import { cn } from "@/shared/lib/utils";
import { DEFAULT_SHOP_BUSINESS_HOURS } from "@/shop/staff/staff-availability";
import {
  DEFAULT_SHOP_TIMEZONE,
  detectBrowserTimezone,
  shopTimezoneSelectOptions,
} from "@/shared/lib/shop-timezone";

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?$/;
const RESERVED = new Set(["admin", "api", "app", "auth", "book", "beheer", "shop", "login", "signup", "support", "legal", "demo", "www"]);

/** Shop-level categories (aligned with service category chips). */
const SHOP_CATEGORIES = ["Hair", "Barber", "Nails", "Beauty", "Tattoo", "Pet"] as const;

function randomSuffix() {
  return Math.random().toString(36).slice(2, 6);
}

type Step = 0 | 1;
type SlugState = "idle" | "checking" | "available" | "taken" | "invalid" | "reserved";

export function ShopOnboarding() {
  const { user } = useAuth();
  const { t } = useT();
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>(0);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugState, setSlugState] = useState<SlugState>("idle");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [nameWarning, setNameWarning] = useState(false);
  const [timezone, setTimezone] = useState(DEFAULT_SHOP_TIMEZONE);
  const [category, setCategory] = useState("");

  const timezoneOptions = useMemo(() => shopTimezoneSelectOptions(timezone), [timezone]);

  // Prefill shop timezone from the owner's device (editable).
  useEffect(() => {
    setTimezone(detectBrowserTimezone());
  }, []);

  const slugValidFormat = useMemo(() => SLUG_RE.test(slug) && !RESERVED.has(slug), [slug]);

  // Debounced slug availability check
  useEffect(() => {
    if (!slug) { setSlugState("idle"); setSuggestions([]); return; }
    if (RESERVED.has(slug)) { setSlugState("reserved"); setSuggestions([]); return; }
    if (!SLUG_RE.test(slug)) { setSlugState("invalid"); setSuggestions([]); return; }
    setSlugState("checking");
    const handle = setTimeout(async () => {
      const { data } = await supabase.from("shops").select("id").eq("slug", slug).maybeSingle();
      if (data) {
        setSlugState("taken");
        // Generate suggestions and verify each is free
        const base = slug.replace(/-\d+$/, "");
        const candidates = [`${base}-1`, `${base}-${randomSuffix()}`, `${base}-shop`, `${base}-${randomSuffix()}`];
        const { data: taken } = await supabase.from("shops").select("slug").in("slug", candidates);
        const takenSet = new Set((taken ?? []).map((r) => r.slug));
        setSuggestions(candidates.filter((c) => !takenSet.has(c)).slice(0, 3));
      } else {
        setSlugState("available");
        setSuggestions([]);
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [slug]);

  // Debounced name similarity check (soft warning)
  useEffect(() => {
    const trimmed = name.trim();
    if (trimmed.length < 3) { setNameWarning(false); return; }
    const handle = setTimeout(async () => {
      const { data } = await supabase.from("shops").select("id").ilike("name", trimmed).limit(1);
      setNameWarning((data ?? []).length > 0);
    }, 400);
    return () => clearTimeout(handle);
  }, [name]);

  const createShop = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error(t("errors.notSignedIn"));
      const finalSlug = slug || slugify(name);
      const { data: shop, error } = await supabase
        .from("shops")
        .insert({
          name: name.trim(),
          slug: finalSlug,
          owner_id: user.id,
          status: "active",
          plan: "trial",
          business_hours: DEFAULT_SHOP_BUSINESS_HOURS,
          timezone: timezone.trim() || DEFAULT_SHOP_TIMEZONE,
          category: category.trim() || null,
        })
        .select("id, slug")
        .single();
      if (error) {
        if ((error as { code?: string }).code === "23505") {
          setSlugState("taken");
          throw new Error("Deze URL is al in gebruik. Kies een andere.");
        }
        throw error;
      }
      return shop;
    },
    onSuccess: () => {
      toast.success(t("onboarding.created"));
      qc.invalidateQueries({ queryKey: ["auth", "shops"] });
      qc.invalidateQueries({ queryKey: ["auth", "roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (!category.trim()) {
      toast.error(t("onboarding.categoryRequired"));
      return;
    }
    if (!timezone.trim()) {
      toast.error(t("onboarding.timezoneRequired"));
      return;
    }
    if (!slugValidFormat) { toast.error("Ongeldige URL — alleen kleine letters, cijfers en streepjes."); return; }
    if (slugState === "taken" || slugState === "reserved" || slugState === "checking") return;
    createShop.mutate();
  };

  const pickSuggestion = (s: string) => { setSlug(s); setSlugTouched(true); };

  const total = 2;
  const progress = ((step + 1) / total) * 100;

  const submitDisabled =
    createShop.isPending ||
    !name.trim() ||
    !slug ||
    !slugValidFormat ||
    !category.trim() ||
    !timezone.trim() ||
    slugState === "taken" ||
    slugState === "reserved" ||
    slugState === "invalid" ||
    slugState === "checking";

  const categoryLabel = (c: string) => {
    const map: Record<string, string> = {
      Hair: t("onboarding.categoryHair"),
      Barber: t("onboarding.categoryBarber"),
      Nails: t("onboarding.categoryNails"),
      Beauty: t("onboarding.categoryBeauty"),
      Tattoo: t("onboarding.categoryTattoo"),
      Pet: t("onboarding.categoryPet"),
    };
    return map[c] ?? c;
  };

  if (createShop.isSuccess) {
    return <FullPageLoader label="Redirecting…" />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-hero px-4 py-12">
      <div className="w-full max-w-xl">
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-brand">
              <Sparkle className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold tracking-tight">FlowyBookings</span>
          </div>
          <LanguageSwitcher />
        </div>

        <div className="rounded-3xl border border-border bg-card p-6 shadow-elevated sm:p-8">
          <div className="mb-6">
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>{t("onboarding.progress", { current: String(step + 1), total: String(total) })}</span>
              <span className="flex items-center gap-1.5">
                {[0, 1].map((i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-1.5 w-6 rounded-full transition-colors",
                      i <= step ? "bg-gradient-brand" : "bg-muted",
                    )}
                  />
                ))}
              </span>
            </div>
            <Progress value={progress} className="h-1.5" />
          </div>

          {step === 0 && (
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{t("onboarding.welcomeTitle")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t("onboarding.welcomeSub")}</p>
              <ul className="mt-6 space-y-3">
                {[
                  { icon: CalendarCheck, k: "onboarding.benefit1" },
                  { icon: Bell, k: "onboarding.benefit2" },
                  { icon: Users, k: "onboarding.benefit3" },
                  { icon: BarChart3, k: "onboarding.benefit4" },
                ].map(({ icon: Icon, k }) => (
                  <li key={k} className="flex items-start gap-3 rounded-xl bg-muted/40 p-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-brand text-primary-foreground">
                      <Icon className="h-4 w-4" />
                    </div>
                    <p className="text-sm text-foreground/90">{t(k)}</p>
                  </li>
                ))}
              </ul>
              <Button variant="hero" className="mt-6 w-full" size="lg" onClick={() => setStep(1)}>
                {t("onboarding.startBtn")}
              </Button>
            </div>
          )}

          {step === 1 && (
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{t("onboarding.createShop")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t("onboarding.sub")}</p>
              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name">{t("onboarding.shopName")}</Label>
                  <Input
                    id="name"
                    placeholder={t("onboarding.shopNamePlaceholder")}
                    required
                    autoFocus
                    value={name}
                    onChange={(e) => {
                      const v = e.target.value;
                      setName(v);
                      if (!slugTouched) setSlug(slugify(v));
                    }}
                  />
                  {nameWarning && (
                    <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>Deze naam bestaat al op het platform. Je kunt doorgaan of een andere naam kiezen.</span>
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="slug">{t("onboarding.urlSlug")}</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">flowybookings.com/</span>
                    <Input
                      id="slug"
                      placeholder={t("onboarding.slugPlaceholder")}
                      required
                      value={slug}
                      onChange={(e) => { setSlug(slugify(e.target.value)); setSlugTouched(true); }}
                      aria-invalid={slugState === "taken" || slugState === "invalid" || slugState === "reserved"}
                    />
                  </div>
                  <div className="min-h-[1.25rem] text-xs">
                    {slugState === "checking" && (
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> Controleren…
                      </span>
                    )}
                    {slugState === "available" && (
                      <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                        <Check className="h-3.5 w-3.5" /> Beschikbaar
                      </span>
                    )}
                    {slugState === "taken" && (
                      <span className="flex items-center gap-1.5 text-destructive">
                        <X className="h-3.5 w-3.5" /> Deze URL is al in gebruik
                      </span>
                    )}
                    {slugState === "reserved" && (
                      <span className="flex items-center gap-1.5 text-destructive">
                        <X className="h-3.5 w-3.5" /> Deze URL is gereserveerd
                      </span>
                    )}
                    {slugState === "invalid" && slug.length > 0 && (
                      <span className="flex items-center gap-1.5 text-destructive">
                        <X className="h-3.5 w-3.5" /> Alleen a–z, 0–9 en streepjes
                      </span>
                    )}
                    {slugState === "idle" && (
                      <span className="text-muted-foreground">{t("onboarding.slugHint")}</span>
                    )}
                  </div>
                  {suggestions.length > 0 && slugState === "taken" && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-xs text-muted-foreground">Suggesties:</span>
                      {suggestions.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => pickSuggestion(s)}
                          className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium hover:bg-muted"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="category">{t("onboarding.category")}</Label>
                  <select
                    id="category"
                    required
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">{t("onboarding.categoryPlaceholder")}</option>
                    {SHOP_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{categoryLabel(c)}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="timezone">{t("onboarding.timezone")}</Label>
                  <select
                    id="timezone"
                    required
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {timezoneOptions.map((tz) => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">{t("onboarding.timezoneHint")}</p>
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <Button type="button" variant="ghost" onClick={() => setStep(0)} disabled={createShop.isPending}>
                    <ArrowLeft className="h-4 w-4" /> {t("book.back")}
                  </Button>
                  <Button type="submit" variant="hero" className="flex-1" disabled={submitDisabled}>
                    {createShop.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    {t("onboarding.createBtn")} <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
