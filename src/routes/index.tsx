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
import { Reveal } from "@/components/Reveal";
import { usePlanPricing, planMonthlyAmount } from "@/lib/use-plan-pricing";
import type { DbPlan } from "@/lib/plans";

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
  const { data: pricingMap } = usePlanPricing();
  const priceFor = (plan: DbPlan, fallback: number) => planMonthlyAmount(pricingMap, plan) ?? fallback;
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
      price: priceFor("starter", 19),
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
      price: priceFor("pro", 49),
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
      price: priceFor("premium", 99),
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
              <Button asChild variant="hero" size="default" className="press">
                <Link to={dashboardHref}>{t("nav.goToDashboard")} <ArrowRight className="h-4 w-4" /></Link>
              </Button>
            ) : (
              <>
                <Link to="/login" className="hidden text-sm font-medium text-muted-foreground hover:text-foreground sm:inline-flex">
                  {t("nav.signIn")}
                </Link>
                <Button asChild variant="hero" size="default" className="press">
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
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs font-medium text-muted-foreground shadow-xs backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-success" /> {t("landing.badge")}
              </span>
            </Reveal>
            <Reveal delay={80}>
              <h1 className="mt-6 text-4xl font-semibold tracking-tight text-foreground sm:text-6xl">
                {t("landing.headline")}{" "}
                <span className="text-gradient-brand">{t("landing.headlineAccent")}</span>
              </h1>
            </Reveal>
            <Reveal delay={160}>
              <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">{t("landing.sub")}</p>
            </Reveal>
            <Reveal delay={240}>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button asChild variant="hero" size="xl" className="press">
                  <Link to="/signup">{t("landing.startFreeTrial")} <ArrowRight className="h-4 w-4" /></Link>
                </Button>
                <Button asChild variant="outline" size="xl" className="press">
                  <Link to="/demo">{t("landing.viewLiveDemo")}</Link>
                </Button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{t("landing.demoHint")}</p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-success-foreground" /> {t("landing.trial")}</span>
                <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-success-foreground" /> {t("landing.noCreditCard")}</span>
                <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-success-foreground" /> {t("landing.cancelAnytime")}</span>
              </div>
            </Reveal>
          </div>

          <Reveal delay={320} className="relative mx-auto mt-16 max-w-5xl">
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
          </Reveal>
        </div>
      </section>

      {/* Social proof — stat cards */}
      <section className="border-t border-border bg-background py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("landing.proof.title")}</h2>
            <p className="mt-3 text-muted-foreground">{t("landing.proof.sub")}</p>
          </Reveal>
          <div className="mt-12 grid gap-5 sm:grid-cols-3">
            {[
              { value: t("landing.proof.stat1.value"), label: t("landing.proof.stat1.label"), desc: t("landing.proof.stat1.desc"), accent: "bg-primary-soft text-primary" },
              { value: t("landing.proof.stat2.value"), label: t("landing.proof.stat2.label"), desc: t("landing.proof.stat2.desc"), accent: "bg-mint text-mint-foreground" },
              { value: t("landing.proof.stat3.value"), label: t("landing.proof.stat3.label"), desc: t("landing.proof.stat3.desc"), accent: "bg-peach text-peach-foreground" },
            ].map((s, i) => (
              <Reveal key={s.label} delay={i * 90} className="rounded-2xl border border-border bg-card p-6 text-center shadow-soft lift">
                <p className={`mx-auto inline-flex rounded-xl px-3 py-1 text-3xl font-bold tracking-tight ${s.accent}`}>{s.value}</p>
                <p className="mt-4 text-base font-semibold">{s.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{s.desc}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Problem → Solution */}
      <section className="border-t border-border bg-muted/40 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("landing.ps.title")}</h2>
            <p className="mt-3 text-muted-foreground">{t("landing.ps.sub")}</p>
          </Reveal>
          <div className="mt-12 grid gap-5 lg:grid-cols-2">
            <Reveal className="rounded-2xl border border-border bg-card p-6 shadow-soft sm:p-8 lift">
              <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("landing.ps.problemsTitle")}</p>
              <ul className="mt-5 space-y-3">
                {[t("landing.ps.p1"), t("landing.ps.p2"), t("landing.ps.p3"), t("landing.ps.p4")].map((p) => (
                  <li key={p} className="flex items-start gap-3 rounded-xl bg-muted/60 px-4 py-3 text-sm">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive"><X className="h-3.5 w-3.5" /></span>
                    <span className="text-foreground/90">{p}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={120} className="rounded-2xl border border-primary/30 bg-card p-6 shadow-soft ring-soft sm:p-8 lift">
              <p className="text-sm font-semibold uppercase tracking-wider text-primary">{t("landing.ps.solutionsTitle")}</p>
              <ul className="mt-5 space-y-3">
                {[t("landing.ps.s1"), t("landing.ps.s2"), t("landing.ps.s3"), t("landing.ps.s4")].map((s) => (
                  <li key={s} className="flex items-start gap-3 rounded-xl bg-primary-soft/40 px-4 py-3 text-sm">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-mint text-mint-foreground"><Check className="h-3.5 w-3.5" /></span>
                    <span className="font-medium text-foreground">{s}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </div>
      </section>

      <section id="features" className="border-t border-border bg-background py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("features.title")}</h2>
            <p className="mt-4 text-muted-foreground">{t("features.sub")}</p>
          </Reveal>
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => {
              const Icon = f.icon;
              return (
                <Reveal key={f.title} delay={i * 70} className="group rounded-2xl border border-border bg-card p-6 shadow-soft lift">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${f.color}`}><Icon className="h-5 w-5" /></div>
                  <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
                </Reveal>
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
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("whyUs.title")}</h2>
            <p className="mt-4 text-muted-foreground">{t("whyUs.sub")}</p>
          </Reveal>
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {whyUs.map((w, i) => {
              const Icon = w.icon;
              return (
                <Reveal key={w.title} delay={i * 70} className="rounded-2xl border border-border bg-card p-6 shadow-soft lift">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${w.color}`}><Icon className="h-5 w-5" /></div>
                  <h3 className="mt-4 text-base font-semibold">{w.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{w.desc}</p>
                </Reveal>
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
            {pricing.map((p, i) => (
              <Reveal key={p.name} delay={i * 80} className={`relative flex flex-col rounded-2xl border bg-card p-6 shadow-soft lift ${p.featured ? "border-primary ring-soft" : "border-border"}`}>
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
                <Button asChild variant={p.featured ? "hero" : "outline"} className="mt-6 press">
                  <Link to="/signup">{t(p.ctaKey)}</Link>
                </Button>
              </Reveal>
            ))}
          </div>
          <PricingComparisonTable />
          <p className="mx-auto mt-10 max-w-3xl text-center text-xs text-muted-foreground">
            {t("pricing.footnote")}
          </p>
        </div>
      </section>

      {/* App feel — mobile-first USP */}
      <section className="border-t border-border bg-background py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary">
                <Smartphone className="h-3.5 w-3.5" /> Mobile-first
              </span>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">{t("landing.appFeel.title")}</h2>
              <p className="mt-4 text-muted-foreground">{t("landing.appFeel.sub")}</p>
              <ul className="mt-6 space-y-3 text-sm">
                {[t("landing.appFeel.b1"), t("landing.appFeel.b2"), t("landing.appFeel.b3")].map((b) => (
                  <li key={b} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-success-foreground" /> {b}
                  </li>
                ))}
              </ul>
              <div className="mt-7">
                <Button asChild variant="hero" size="lg" className="press">
                  <Link to="/signup">{t("landing.startFreeTrial")} <ArrowRight className="h-4 w-4" /></Link>
                </Button>
              </div>
            </Reveal>
            <Reveal delay={140} className="relative mx-auto w-full max-w-sm">
              <div className="rounded-[2.25rem] border-8 border-foreground/90 bg-card shadow-elevated">
                <div className="rounded-[1.5rem] bg-gradient-to-br from-primary-soft via-card to-pink p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary">{t("landing.today")}</p>
                    <span className="rounded-full bg-mint px-2 py-0.5 text-[10px] font-semibold text-mint-foreground">Live</span>
                  </div>
                  <p className="mt-2 text-2xl font-semibold tracking-tight">€1,240</p>
                  <p className="text-xs text-muted-foreground">{t("landing.fromBookings", { count: 18 })}</p>
                  <div className="mt-4 space-y-2">
                    {["10:00 · Sophie", "11:30 · Liam", "13:00 · Noor", "15:00 · Ava"].map((txt) => (
                      <div key={txt} className="flex items-center justify-between rounded-xl bg-card/80 px-3 py-2 text-sm shadow-xs">
                        <span className="flex items-center gap-2"><CalendarCheck className="h-3.5 w-3.5 text-primary" />{txt}</span>
                        <Check className="h-3.5 w-3.5 text-success-foreground" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Transparency */}
      <section className="border-t border-border bg-muted/40 py-20">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <span className="inline-flex items-center gap-2 rounded-full bg-mint px-3 py-1 text-xs font-medium text-mint-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> {t("landing.transparency.title")}
          </span>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">{t("landing.transparency.title")}</h2>
          <p className="mt-4 text-muted-foreground">{t("landing.transparency.sub")}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {[t("landing.transparency.b1"), t("landing.transparency.b2"), t("landing.transparency.b3")].map((b) => (
              <span key={b} className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium shadow-xs">
                <Check className="h-4 w-4 text-success-foreground" /> {b}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-border bg-background py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary">
              <HelpCircle className="h-3.5 w-3.5" /> FAQ
            </span>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">{t("landing.faq.title")}</h2>
          </div>
          <Accordion type="single" collapsible className="mt-10 rounded-2xl border border-border bg-card px-6 shadow-soft">
            {[
              { q: t("landing.faq.q1"), a: t("landing.faq.a1") },
              { q: t("landing.faq.q2"), a: t("landing.faq.a2") },
              { q: t("landing.faq.q3"), a: t("landing.faq.a3") },
              { q: t("landing.faq.q4"), a: t("landing.faq.a4") },
            ].map((item, i) => (
              <AccordionItem key={item.q} value={`faq-${i}`} className="border-border last:border-0">
                <AccordionTrigger className="text-base font-semibold">{item.q}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <Reveal className="overflow-hidden rounded-3xl bg-gradient-brand p-10 text-center text-primary-foreground shadow-glow sm:p-16">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("landing.finalCta.title")}</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm opacity-90 sm:text-base">{t("landing.finalCta.sub")}</p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="xl" className="bg-card text-foreground hover:bg-card/90 press">
                <Link to="/signup">{t("landing.startFreeTrial")} <ArrowRight className="h-4 w-4" /></Link>
              </Button>
              <Button asChild size="xl" variant="outline" className="border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 press">
                <Link to="/demo">{t("landing.viewLiveDemo")}</Link>
              </Button>
            </div>
            <p className="mt-4 text-xs opacity-80">
              <Check className="mr-1 inline h-3.5 w-3.5" /> {t("landing.trial")}
              <span className="mx-2">·</span>
              <Check className="mr-1 inline h-3.5 w-3.5" /> {t("landing.noCreditCard")}
              <span className="mx-2">·</span>
              <Check className="mr-1 inline h-3.5 w-3.5" /> {t("landing.cancelAnytime")}
            </p>
          </Reveal>
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
