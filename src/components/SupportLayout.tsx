import { type ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { ArrowLeft, Sparkle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export function SupportLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const { session } = useAuth();
  const location = useLocation();
  const { t } = useT();
  const backHref = session ? "/shop" : "/";
  const isLegal = location.pathname.startsWith("/legal");

  return (
    <div className="min-h-screen bg-gradient-hero">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/80 px-4 backdrop-blur">
        <Link
          to={isLegal ? "/support" : backHref}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={t("legal.back")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-brand">
            <Sparkle className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
          <span className="text-sm font-semibold tracking-tight">FlowyBookings</span>
        </Link>
        <div className="ml-auto">
          <LanguageSwitcher />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 pb-20 pt-6 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {children}
      </main>
    </div>
  );
}

export function LegalSection({
  heading,
  children,
}: {
  heading?: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-5">
      {heading && <h2 className="mb-2 text-sm font-semibold tracking-tight">{heading}</h2>}
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export function CompanyFootnote() {
  const { t } = useT();
  return (
    <p className="mt-10 text-center text-[11px] text-muted-foreground/70">
      {t("support.company")}
    </p>
  );
}
