import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import {
  CalendarCheck,
  Sparkles,
  Bell,
  CreditCard,
  BarChart3,
  Users,
  Sparkle,
  ArrowRight,
  Check,
  Star,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bookly — Modern booking platform for service businesses" },
      {
        name: "description",
        content:
          "All-in-one booking, payments, reminders and analytics for tattoo shops, barbers, nail salons, beauty studios and groomers.",
      },
      { property: "og:title", content: "Bookly — Modern booking platform for service businesses" },
      {
        property: "og:description",
        content:
          "Booking, payments, reminders and analytics — built for tattoo shops, barbers, nail bars, beauty studios and groomers.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { session, loading, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (loading || !session) return;
    navigate({ to: isSuperAdmin ? "/beheer/dashboard" : "/shop" });
  }, [session, loading, isSuperAdmin, navigate]);

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-brand">
              <Sparkle className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold tracking-tight">Bookly</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#pricing" className="hover:text-foreground">Pricing</a>
            <a href="#testimonials" className="hover:text-foreground">Loved by</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="hidden text-sm font-medium text-muted-foreground hover:text-foreground sm:inline-flex"
            >
              Sign in
            </Link>
            <Button asChild variant="hero" size="default">
              <Link to="/signup">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-hero opacity-90" />
        <div className="mx-auto max-w-7xl px-4 pb-24 pt-16 sm:px-6 sm:pt-24 lg:px-8 lg:pb-32">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs font-medium text-muted-foreground shadow-xs backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-success" /> New · WhatsApp reminders
            </span>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-foreground sm:text-6xl">
              The booking platform that{" "}
              <span className="text-gradient-brand">grows with your shop</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
              Bookly powers tattoo studios, barbers, nail bars, beauty studios and pet groomers.
              Manage bookings, payments, staff and reminders — all in one place.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild variant="hero" size="xl">
                <Link to="/book">
                  Try the booking flow <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="xl">
                <Link to="/shop">See the dashboard</Link>
              </Button>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-success-foreground" /> 14-day free trial
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-success-foreground" /> No credit card
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-success-foreground" /> Cancel anytime
              </span>
            </div>
          </div>

          {/* Hero card preview */}
          <div className="relative mx-auto mt-16 max-w-5xl">
            <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-elevated">
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr]">
                <div className="border-b border-border bg-gradient-to-br from-primary-soft to-pink p-6 lg:border-b-0 lg:border-r">
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                    Today
                  </p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight">€1,240</p>
                  <p className="text-sm text-muted-foreground">From 18 confirmed bookings</p>
                  <div className="mt-6 space-y-2">
                    {["10:00 · Sleeve Tattoo · Sophia", "11:30 · Beard Trim · Liam", "13:00 · Gel Manicure · Noah", "15:00 · Lash Extensions · Ava"].map(
                      (t) => (
                        <div
                          key={t}
                          className="flex items-center gap-2 rounded-xl bg-card/70 px-3 py-2 text-sm shadow-xs"
                        >
                          <CalendarCheck className="h-4 w-4 text-primary" />
                          {t}
                        </div>
                      ),
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 p-6">
                  {[
                    { label: "Bookings this week", value: "94", icon: CalendarCheck, accent: "bg-primary-soft text-primary" },
                    { label: "Revenue this week", value: "€6,110", icon: BarChart3, accent: "bg-mint text-mint-foreground" },
                    { label: "Active customers", value: "412", icon: Users, accent: "bg-peach text-peach-foreground" },
                    { label: "Reminders sent", value: "1.2k", icon: Bell, accent: "bg-pink text-pink-foreground" },
                  ].map((s) => {
                    const Icon = s.icon;
                    return (
                      <div key={s.label} className="rounded-2xl border border-border bg-card p-4">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${s.accent}`}>
                          <Icon className="h-4 w-4" />
                        </div>
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

      {/* Features */}
      <section id="features" className="border-t border-border bg-background py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Everything your shop needs, beautifully organized
            </h2>
            <p className="mt-4 text-muted-foreground">
              From the first tap to the final tip — Bookly handles every moment of the customer
              journey.
            </p>
          </div>
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="group rounded-2xl border border-border bg-card p-6 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-elevated"
                >
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${f.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Built for */}
      <section className="border-t border-border bg-muted/40 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm font-medium text-muted-foreground">
            Built for service businesses of every shape
          </p>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {industries.map((i) => (
              <div
                key={i}
                className="rounded-2xl border border-border bg-card px-4 py-5 text-center text-sm font-medium shadow-xs"
              >
                {i}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="border-t border-border py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="mx-auto max-w-2xl text-center text-3xl font-semibold tracking-tight sm:text-4xl">
            Loved by independent studios and growing chains
          </h2>
          <div className="mt-14 grid gap-5 lg:grid-cols-3">
            {testimonials.map((t) => (
              <figure
                key={t.author}
                className="rounded-2xl border border-border bg-card p-6 shadow-soft"
              >
                <div className="flex items-center gap-1 text-warning-foreground">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-current" />
                  ))}
                </div>
                <blockquote className="mt-4 text-sm leading-relaxed text-foreground">
                  “{t.quote}”
                </blockquote>
                <figcaption className="mt-5 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-warm text-sm font-semibold text-pink-foreground">
                    {t.author[0]}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{t.author}</p>
                    <p className="text-xs text-muted-foreground">{t.role}</p>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-border bg-muted/40 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Simple pricing</h2>
            <p className="mt-4 text-muted-foreground">Start free. Upgrade as you grow.</p>
          </div>
          <div className="mt-14 grid gap-5 lg:grid-cols-4">
            {pricing.map((p) => (
              <div
                key={p.name}
                className={`relative flex flex-col rounded-2xl border bg-card p-6 shadow-soft ${
                  p.featured ? "border-primary ring-soft" : "border-border"
                }`}
              >
                {p.featured && (
                  <span className="absolute -top-3 left-6 rounded-full bg-gradient-brand px-3 py-1 text-xs font-semibold text-primary-foreground">
                    Most popular
                  </span>
                )}
                <h3 className="text-base font-semibold">{p.name}</h3>
                <p className="mt-3 text-3xl font-semibold tracking-tight">
                  €{p.price}
                  <span className="text-sm font-normal text-muted-foreground">/{p.period}</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{p.fee} transaction fee</p>
                <ul className="mt-5 flex-1 space-y-2 text-sm text-muted-foreground">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success-foreground" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  asChild
                  variant={p.featured ? "hero" : "outline"}
                  className="mt-6"
                >
                  <Link to="/shop">Start {p.name}</Link>
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="overflow-hidden rounded-3xl bg-gradient-brand p-10 text-center text-primary-foreground shadow-glow sm:p-16">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Ready to fill your calendar?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm opacity-90 sm:text-base">
              Join 470+ shops booking smarter with Bookly.
            </p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="xl" className="bg-card text-foreground hover:bg-card/90">
                <Link to="/book">Try the booking flow</Link>
              </Button>
              <Button asChild size="xl" variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/10">
                <Link to="/shop">Explore dashboard →</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-brand">
              <Sparkle className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold">Bookly</span>
            <span className="text-xs text-muted-foreground">© {new Date().getFullYear()}</span>
          </div>
          <div className="flex items-center gap-5 text-xs text-muted-foreground">
            <a href="#" className="hover:text-foreground">Terms</a>
            <a href="#" className="hover:text-foreground">Privacy</a>
            <a href="#" className="hover:text-foreground">Status</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

const features = [
  { title: "Smart bookings", desc: "Daily and weekly calendar, drag-and-drop, conflict detection.", icon: CalendarCheck, color: "bg-primary-soft text-primary" },
  { title: "Customer profiles", desc: "Notes, preferences, history and lifetime spend in one view.", icon: Users, color: "bg-peach text-peach-foreground" },
  { title: "Payments & deposits", desc: "Stripe & Mollie ready. Track paid, unpaid and refunds.", icon: CreditCard, color: "bg-mint text-mint-foreground" },
  { title: "Reminders that work", desc: "Email, SMS and WhatsApp at 24h and 2h before the slot.", icon: Bell, color: "bg-pink text-pink-foreground" },
  { title: "Insightful analytics", desc: "Revenue, no-shows, busy days, top services and returning customers.", icon: BarChart3, color: "bg-info/15 text-info-foreground" },
  { title: "Mobile-first", desc: "Polished on every screen — your shop, in your pocket.", icon: Smartphone, color: "bg-secondary text-secondary-foreground" },
];

const industries = ["Tattoo", "Barber", "Nails", "Beauty", "Hair", "Pet grooming"];

const testimonials = [
  { quote: "We cut no-shows by 60% in the first month. The reminders just work.", author: "Sophia Reyes", role: "Owner · Inkwell Studio" },
  { quote: "Finally a dashboard that doesn't feel like 2012. Our team adopted it in a day.", author: "Marco Bianchi", role: "Manager · Sharp & Co." },
  { quote: "Deposits + WhatsApp reminders changed how we run weekends.", author: "Iris Nakamura", role: "Founder · Bloom Nail Bar" },
];

const pricing = [
  { name: "Trial", price: 0, period: "14d", fee: "0%", featured: false, features: ["1 staff", "Up to 30 bookings", "Email reminders"] },
  { name: "Starter", price: 19, period: "mo", fee: "1.5%", featured: false, features: ["3 staff", "Unlimited bookings", "SMS + Email", "Basic analytics"] },
  { name: "Pro", price: 49, period: "mo", fee: "1.0%", featured: true, features: ["10 staff", "WhatsApp reminders", "Advanced analytics", "Custom branding"] },
  { name: "Premium", price: 99, period: "mo", fee: "0.5%", featured: false, features: ["Unlimited staff", "Multi-location", "Priority support", "API access"] },
];
