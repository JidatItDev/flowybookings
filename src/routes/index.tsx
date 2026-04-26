import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import {
  CalendarCheck, Sparkles, Bell, CreditCard, BarChart3, Users,
  Sparkle, ArrowRight, Check, ShieldCheck, Smartphone, Zap, Euro, MessageCircle,
  X, HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { PricingComparisonTable } from "@/components/PricingComparisonTable";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FlowyBookings — Modern boekingsplatform voor dienstverleners" },
      { name: "description", content: "Boekingen, betalingen, herinneringen en statistieken voor tattooshops, kappers, nagelsalons, beautystudio's en trimsalons. Mollie, iDEAL en Bancontact ingebouwd." },
      { property: "og:title", content: "FlowyBookings — Modern boekingsplatform voor dienstverleners" },
      { property: "og:description", content: "Boekingen, betalingen en herinneringen — gebouwd voor zaken in de Benelux." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { session, isSuperAdmin } = useAuth();
  const { t } = useT();
  // Note: do NOT auto-redirect authenticated users away from "/".
  // The homepage stays accessible at all times. We only show a small CTA
  // pointing them to their dashboard (rendered in the header below).
  const dashboardHref = isSuperAdmin ? "/beheer/dashboard" : "/shop";

  const features = [
    { title: t("features.smartBookings"), desc: t("features.smartBookingsDesc"), icon: CalendarCheck, color: "bg-primary-soft text-primary" },
    { title: t("features.customerProfiles"), desc: t("features.customerProfilesDesc"), icon: Users, color: "bg-peach text-peach-foreground" },
    { title: t("features.payments"), desc: t("features.paymentsDesc"), icon: CreditCard, color: "bg-mint text-mint-foreground" },
    { title: t("features.reminders"), desc: t("features.remindersDesc"), icon: Bell, color: "bg-pink text-pink-foreground" },
    { title: t("features.analytics"), desc: t("features.analyticsDesc"), icon: BarChart3, color: "bg-info/15 text-info-foreground" },
    { title: t("features.mobile"), desc: t("features.mobileDesc"), icon: Smartphone, color: "bg-secondary text-secondary-foreground" },
  ];

  const industries = [
    t("builtFor.tattoo"), t("builtFor.barber"), t("builtFor.nails"),
    t("builtFor.beauty"), t("builtFor.hair"), t("builtFor.petGrooming"),
  ];

  const whyUs = [
    { title: t("whyUs.localTitle"), desc: t("whyUs.localDesc"), icon: Euro, color: "bg-mint text-mint-foreground" },
    { title: t("whyUs.noShowTitle"), desc: t("whyUs.noShowDesc"), icon: Bell, color: "bg-pink text-pink-foreground" },
    { title: t("whyUs.fastTitle"), desc: t("whyUs.fastDesc"), icon: Zap, color: "bg-primary-soft text-primary" },
    { title: t("whyUs.ownTitle"), desc: t("whyUs.ownDesc"), icon: ShieldCheck, color: "bg-info/15 text-info-foreground" },
    { title: t("whyUs.transparentTitle"), desc: t("whyUs.transparentDesc"), icon: BarChart3, color: "bg-peach text-peach-foreground" },
    { title: t("whyUs.supportTitle"), desc: t("whyUs.supportDesc"), icon: MessageCircle, color: "bg-secondary text-secondary-foreground" },
  ];

  const pricing = [
    {
      name: "Trial",
      price: 0,
      period: t("pricing.period.trial"),
      fee: t("pricing.compare.val.noFee"),
      feeIsFree: true,
      featured: false,
      ctaKey: "pricing.cta.trial",
      features: [
        t("pricing.feat.trial.staff"),
        t("pricing.feat.trial.bookings"),
        t("pricing.feat.trial.reminders"),
        t("pricing.feat.trial.fee"),
      ],
    },
    {
      name: "Starter",
      price: 19,
      period: t("pricing.period.month"),
      fee: t("pricing.compare.val.starterFee"),
      feeIsFree: false,
      featured: false,
      ctaKey: "pricing.cta.starter",
      features: [
        t("pricing.feat.starter.staff"),
        t("pricing.feat.starter.bookings"),
        t("pricing.feat.starter.reminders"),
        t("pricing.feat.starter.fee"),
      ],
    },
    {
      name: "Pro",
      price: 49,
      period: t("pricing.period.month"),
      fee: t("pricing.compare.val.proFee"),
      feeIsFree: false,
      featured: true,
      ctaKey: "pricing.cta.pro",
      features: [
        t("pricing.feat.pro.staff"),
        t("pricing.feat.pro.bookings"),
        t("pricing.feat.pro.reminders"),
        t("pricing.feat.pro.analytics"),
        t("pricing.feat.pro.branding"),
        t("pricing.feat.pro.fee"),
      ],
    },
    {
      name: "Premium",
      price: 99,
      period: t("pricing.period.month"),
      fee: t("pricing.compare.val.noFee"),
      feeIsFree: true,
      featured: false,
      ctaKey: "pricing.cta.premium",
      features: [
        t("pricing.feat.premium.staff"),
        t("pricing.feat.premium.multilocation"),
        t("pricing.feat.premium.support"),
        t("pricing.feat.premium.api"),
        t("pricing.feat.premium.fee"),
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-brand">
              <Sparkle className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold tracking-tight">FlowyBookings</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">{t("nav.features")}</a>
            <a href="#pricing" className="hover:text-foreground">{t("nav.pricing")}</a>
            <a href="#testimonials" className="hover:text-foreground">{t("nav.lovedBy")}</a>
          </nav>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            {session ? (
              <Button asChild variant="hero" size="default">
                <Link to={dashboardHref}>{t("nav.goToDashboard")} <ArrowRight className="h-4 w-4" /></Link>
              </Button>
            ) : (
              <>
                <Link to="/login" className="hidden text-sm font-medium text-muted-foreground hover:text-foreground sm:inline-flex">
                  {t("nav.signIn")}
                </Link>
                <Button asChild variant="hero" size="default">
                  <Link to="/signup">{t("nav.getStarted")}</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-hero opacity-90" />
        <div className="mx-auto max-w-7xl px-4 pb-24 pt-16 sm:px-6 sm:pt-24 lg:px-8 lg:pb-32">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs font-medium text-muted-foreground shadow-xs backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-success" /> {t("landing.badge")}
            </span>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-foreground sm:text-6xl">
              {t("landing.headline")}{" "}
              <span className="text-gradient-brand">{t("landing.headlineAccent")}</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">{t("landing.sub")}</p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild variant="hero" size="xl">
                <Link to="/demo">{t("landing.viewLiveDemo")} <ArrowRight className="h-4 w-4" /></Link>
              </Button>
              <Button asChild variant="outline" size="xl">
                <Link to="/signup">{t("landing.startFreeTrial")}</Link>
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{t("landing.demoHint")}</p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-success-foreground" /> {t("landing.trial")}</span>
              <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-success-foreground" /> {t("landing.noCreditCard")}</span>
              <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-success-foreground" /> {t("landing.cancelAnytime")}</span>
            </div>
          </div>

          <div className="relative mx-auto mt-16 max-w-5xl">
            <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-elevated">
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr]">
                <div className="border-b border-border bg-gradient-to-br from-primary-soft to-pink p-6 lg:border-b-0 lg:border-r">
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary">{t("landing.today")}</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight">€1,240</p>
                  <p className="text-sm text-muted-foreground">{t("landing.fromBookings", { count: 18 })}</p>
                  <div className="mt-6 space-y-2">
                    {["10:00 · Sleeve tattoo · Sophie", "11:30 · Baard trimmen · Liam", "13:00 · Gel manicure · Noor", "15:00 · Wimperextensions · Ava"].map((txt) => (
                      <div key={txt} className="flex items-center gap-2 rounded-xl bg-card/70 px-3 py-2 text-sm shadow-xs">
                        <CalendarCheck className="h-4 w-4 text-primary" /> {txt}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 p-6">
                  {[
                    { label: t("landing.bookingsWeek"), value: "94", icon: CalendarCheck, accent: "bg-primary-soft text-primary" },
                    { label: t("landing.revenueWeek"), value: "€6,110", icon: BarChart3, accent: "bg-mint text-mint-foreground" },
                    { label: t("landing.activeCustomers"), value: "412", icon: Users, accent: "bg-peach text-peach-foreground" },
                    { label: t("landing.remindersSent"), value: "1.2k", icon: Bell, accent: "bg-pink text-pink-foreground" },
                  ].map((s) => {
                    const Icon = s.icon;
                    return (
                      <div key={s.label} className="rounded-2xl border border-border bg-card p-4">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${s.accent}`}><Icon className="h-4 w-4" /></div>
                        <p className="mt-3 text-xs text-muted-foreground">{s.label}</p>
                        <p className="text-xl font-semibold tracking-tight">{s.value}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="border-t border-border bg-background py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("features.title")}</h2>
            <p className="mt-4 text-muted-foreground">{t("features.sub")}</p>
          </div>
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="group rounded-2xl border border-border bg-card p-6 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-elevated">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${f.color}`}><Icon className="h-5 w-5" /></div>
                  <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-muted/40 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm font-medium text-muted-foreground">{t("builtFor.title")}</p>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {industries.map((i) => (
              <div key={i} className="rounded-2xl border border-border bg-card px-4 py-5 text-center text-sm font-medium shadow-xs">{i}</div>
            ))}
          </div>
        </div>
      </section>

      <section id="testimonials" className="border-t border-border py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("whyUs.title")}</h2>
            <p className="mt-4 text-muted-foreground">{t("whyUs.sub")}</p>
          </div>
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {whyUs.map((w) => {
              const Icon = w.icon;
              return (
                <div key={w.title} className="rounded-2xl border border-border bg-card p-6 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-elevated">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${w.color}`}><Icon className="h-5 w-5" /></div>
                  <h3 className="mt-4 text-base font-semibold">{w.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{w.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="pricing" className="border-t border-border bg-muted/40 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("pricing.title")}</h2>
            <p className="mt-4 text-muted-foreground">{t("pricing.sub")}</p>
          </div>
          <div className="mt-14 grid gap-5 lg:grid-cols-4">
            {pricing.map((p) => (
              <div key={p.name} className={`relative flex flex-col rounded-2xl border bg-card p-6 shadow-soft ${p.featured ? "border-primary ring-soft" : "border-border"}`}>
                {p.featured && <span className="absolute -top-3 left-6 rounded-full bg-gradient-brand px-3 py-1 text-xs font-semibold text-primary-foreground">{t("pricing.mostPopular")}</span>}
                <h3 className="text-base font-semibold">{p.name}</h3>
                <p className="mt-3 text-3xl font-semibold tracking-tight">€{p.price}<span className="text-sm font-normal text-muted-foreground">/{p.period}</span></p>
                <p className="mt-1 text-xs font-medium text-muted-foreground">
                  {p.feeIsFree ? (
                    <span className="text-success-foreground">{t("pricing.noFee")}</span>
                  ) : (
                    <>{p.fee} {t("pricing.transactionFee")}</>
                  )}
                </p>
                <ul className="mt-5 flex-1 space-y-2 text-sm text-muted-foreground">
                  {p.features.map((f) => <li key={f} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-success-foreground" />{f}</li>)}
                </ul>
                <Button asChild variant={p.featured ? "hero" : "outline"} className="mt-6">
                  <Link to="/signup">{t(p.ctaKey)}</Link>
                </Button>
              </div>
            ))}
          </div>
          <PricingComparisonTable />
          <p className="mx-auto mt-10 max-w-3xl text-center text-xs text-muted-foreground">
            {t("pricing.footnote")}
          </p>
        </div>
      </section>

      <section className="py-24">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="overflow-hidden rounded-3xl bg-gradient-brand p-10 text-center text-primary-foreground shadow-glow sm:p-16">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("cta.title")}</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm opacity-90 sm:text-base">{t("cta.sub")}</p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="xl" className="bg-card text-foreground hover:bg-card/90"><Link to="/demo">{t("cta.tryBooking")}</Link></Button>
              <Button asChild size="xl" variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/10"><Link to="/login">{t("cta.exploreDashboard")}</Link></Button>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-brand"><Sparkle className="h-3.5 w-3.5 text-primary-foreground" /></div>
            <span className="text-sm font-semibold">FlowyBookings</span>
            <span className="text-xs text-muted-foreground">{t("app.copyright", { year: new Date().getFullYear() })}</span>
          </div>
          <div className="flex items-center gap-5 text-xs text-muted-foreground">
            <a href="#" className="hover:text-foreground">{t("nav.terms")}</a>
            <a href="#" className="hover:text-foreground">{t("nav.privacy")}</a>
            <a href="#" className="hover:text-foreground">{t("nav.status")}</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
