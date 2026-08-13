import {
  Outlet,
  Link,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/auth/lib/auth-context";
import { I18nProvider, type Locale } from "@/shared/lib/i18n";
import { getLocaleCookie } from "@/shared/lib/locale-cookie";

import appCss from "../styles.css?url";

interface RouterContext {
  queryClient: QueryClient;
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async () => {
    // Read the locale cookie on the server so SSR renders the right language.
    // On the client this no-ops to null (cookie is also read in I18nProvider).
    let locale: Locale = "nl";
    try {
      if (typeof window === "undefined") {
        const cookieLocale = await getLocaleCookie();
        if (cookieLocale === "nl" || cookieLocale === "en") locale = cookieLocale;
      } else {
        const m = document.cookie.match(/(?:^|;\s*)flowybookings_lang=(nl|en)/);
        if (m) locale = m[1] as Locale;
      }
    } catch {
      // ignore — fall back to default
    }
    return { locale };
  },
  head: ({ match }) => {
    const locale = (match.context as { locale?: Locale } | undefined)?.locale ?? "nl";
    const isNL = locale === "nl";
    const title = isNL
      ? "FlowyBookings — Boekingsplatform voor servicebedrijven"
      : "FlowyBookings — Booking platform for service businesses";
    const desc = isNL
      ? "FlowyBookings is een modern multi-tenant boekingsplatform voor tattoo shops, kappers, nagelsalons, beautystudio's en hondentrimmers."
      : "FlowyBookings is a modern multi-tenant booking platform for tattoo shops, barbers, nail salons, beauty studios and pet groomers.";
    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:locale", content: isNL ? "nl_NL" : "en_US" },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
        { property: "og:site_name", content: "FlowyBookings" },
      ],
      links: [{ rel: "stylesheet", href: appCss }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "FlowyBookings",
            url: "https://www.flowybookings.com",
            logo: "https://www.flowybookings.com/favicon.ico",
          }),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "FlowyBookings",
            url: "https://www.flowybookings.com",
          }),
        },
      ],
    };
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  const { locale } = Route.useRouteContext();
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient, locale } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider initialLocale={locale}>
        <AuthProvider>
          <Outlet />
          <Toaster richColors position="top-right" />
        </AuthProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}
