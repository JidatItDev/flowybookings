import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkle, Loader2, Check, ArrowRight, ArrowLeft, CalendarCheck, Bell, Users, BarChart3, Copy } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").slice(0, 60);
}

type Step = 0 | 1 | 2;

export function ShopOnboarding() {
  const { user } = useAuth();
  const { t } = useT();
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>(0);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);

  const createShop = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error(t("errors.notSignedIn"));
      const finalSlug = slug || slugify(name);
      const { data: shop, error } = await supabase
        .from("shops")
        .insert({ name, slug: finalSlug, owner_id: user.id, status: "active", plan: "trial" })
        .select("id, slug")
        .single();
      if (error) throw error;
      await supabase.from("user_roles").insert({ user_id: user.id, role: "shop_owner", shop_id: shop.id });
      return shop;
    },
    onSuccess: (shop) => {
      toast.success(t("onboarding.created"));
      setCreatedSlug(shop.slug);
      qc.invalidateQueries({ queryKey: ["auth", "shops"] });
      qc.invalidateQueries({ queryKey: ["auth", "roles"] });
      setStep(2);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createShop.mutate();
  };

  const total = 3;
  const progress = ((step + 1) / total) * 100;

  const bookingUrl = createdSlug ? `${typeof window !== "undefined" ? window.location.origin : "https://flowybookings.com"}/book` : "";

  const copyLink = async () => {
    if (!bookingUrl) return;
    try {
      await navigator.clipboard.writeText(bookingUrl);
      toast.success(t("onboarding.linkCopied"));
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-hero px-4 py-12">
      <div className="w-full max-w-xl">
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-brand">
            <Sparkle className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-lg font-semibold tracking-tight">FlowyBookings</span>
        </div>

        <div className="rounded-3xl border border-border bg-card p-6 shadow-elevated sm:p-8">
          <div className="mb-6">
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>{t("onboarding.progress", { current: String(step + 1), total: String(total) })}</span>
              <span className="flex items-center gap-1.5">
                {[0, 1, 2].map((i) => (
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
                    onChange={(e) => { setName(e.target.value); if (!slug) setSlug(slugify(e.target.value)); }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="slug">{t("onboarding.urlSlug")}</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">flowybookings.com/</span>
                    <Input id="slug" placeholder={t("onboarding.slugPlaceholder")} required value={slug} onChange={(e) => setSlug(slugify(e.target.value))} />
                  </div>
                  <p className="text-xs text-muted-foreground">{t("onboarding.slugHint")}</p>
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <Button type="button" variant="ghost" onClick={() => setStep(0)} disabled={createShop.isPending}>
                    <ArrowLeft className="h-4 w-4" /> {t("book.back")}
                  </Button>
                  <Button type="submit" variant="hero" className="flex-1" disabled={createShop.isPending}>
                    {createShop.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    {t("onboarding.createBtn")} <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </form>
            </div>
          )}

          {step === 2 && (
            <div>
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success text-success-foreground">
                <Check className="h-6 w-6" />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">{t("onboarding.readyTitle")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t("onboarding.readySub")}</p>

              <ul className="mt-5 space-y-2">
                {["onboarding.next1", "onboarding.next2", "onboarding.next3"].map((k, i) => (
                  <li key={k} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                      {i + 1}
                    </span>
                    <p className="text-sm">{t(k)}</p>
                  </li>
                ))}
              </ul>

              {createdSlug && (
                <div className="mt-5 rounded-xl border border-border bg-muted/40 p-3">
                  <p className="text-xs font-medium text-muted-foreground">{t("onboarding.shareLink")}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-lg bg-background px-2 py-1.5 text-xs">{bookingUrl}</code>
                    <Button type="button" variant="outline" size="sm" onClick={copyLink}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}

              <Button
                variant="hero"
                className="mt-6 w-full"
                size="lg"
                onClick={() => { window.location.href = "/shop"; }}
              >
                {t("onboarding.goDashboard")} <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
