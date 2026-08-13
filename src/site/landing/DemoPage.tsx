// Demo entry point — single CTA from homepage.
// Auto-opens default demo shop, or shows a small picker when there are 2+.
// Reuses the existing /book flow via ?shop=<id>; never builds a duplicate booking system.

import { useEffect } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Sparkle, ArrowRight, Scissors, Brush } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { LanguageSwitcher } from "@/shared/components/LanguageSwitcher";
import { useT } from "@/shared/lib/i18n";

export function DemoPage() {
  const navigate = useNavigate();
  const { t } = useT();

  const demoShops = useQuery({
    queryKey: ["demo-shops"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shops")
        .select("id, name, slug, address, is_demo")
        .eq("status", "active")
        .eq("is_demo", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Auto-redirect when only one demo shop exists
  useEffect(() => {
    if (demoShops.data && demoShops.data.length === 1 && demoShops.data[0].slug) {
      navigate({
        to: "/book/$slug",
        params: { slug: demoShops.data[0].slug },
        replace: true,
      });
    }
  }, [demoShops.data, navigate]);

  if (demoShops.isLoading || (demoShops.data && demoShops.data.length === 1)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-hero">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!demoShops.data || demoShops.data.length === 0) {
    // No demo configured — fall back to the regular booking page so we never dead-end
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-hero px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold">{t("demo.notReady")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("demo.notReadySub")}</p>
          <Button asChild variant="hero" className="mt-6">
            <Link to="/">{t("book.backHome")} <ArrowRight className="h-4 w-4" /></Link>
          </Button>
        </div>
      </div>
    );
  }

  // Picker (2+ demo shops)
  const iconFor = (name: string) =>
    /barber|sharp/i.test(name) ? Scissors : Brush;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-brand">
              <Sparkle className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-base font-semibold">FlowyBookings</span>
          </Link>
          <LanguageSwitcher />
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs font-medium text-muted-foreground shadow-xs">
          <span className="h-1.5 w-1.5 rounded-full bg-success" /> {t("demo.badge")}
        </span>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">{t("demo.pickTitle")}</h1>
        <p className="mt-2 max-w-xl text-muted-foreground">{t("demo.pickSub")}</p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {demoShops.data.map((s) => {
            const Icon = iconFor(s.name);
            return (
              <Link
                key={s.id}
                to="/book/$slug"
                params={{ slug: s.slug }}
                className="group rounded-3xl border border-border bg-card p-6 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-elevated"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-warm text-pink-foreground">
                  <Icon className="h-6 w-6" />
                </div>
                <h2 className="mt-4 text-lg font-semibold">{s.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{s.address ?? s.slug}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                  {t("demo.openShop")} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            );
          })}
        </div>

        <p className="mt-8 text-xs text-muted-foreground">{t("demo.safeNotice")}</p>
      </div>
    </div>
  );
}
