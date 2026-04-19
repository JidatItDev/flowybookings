import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { setLocaleCookie } from "./locale-cookie";

export type Locale = "nl" | "en";

type Translations = Record<string, string>;

import { nl } from "./translations/nl";
import { en } from "./translations/en";

const dicts: Record<Locale, Translations> = { nl, en };

interface I18nCtx {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nCtx>({
  locale: "nl",
  setLocale: () => {},
  t: (k) => k,
});

const COOKIE_NAME = "flowybookings_lang";
const STORAGE_KEY = "flowybookings_lang";

function readCookieClient(): Locale | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)flowybookings_lang=(nl|en)/);
  return match ? (match[1] as Locale) : null;
}

export function I18nProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  // SSR-safe: server passes initialLocale from cookie; client mirrors it.
  const [locale, setLocaleState] = useState<Locale>(initialLocale ?? "nl");

  // After hydration, reconcile if the cookie/localStorage differs from the
  // SSR value (e.g. user changed it in another tab). This is a no-op on first
  // visit when initialLocale already matches.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const fromCookie = readCookieClient();
    const fromStorage = localStorage.getItem(STORAGE_KEY) as Locale | null;
    const stored = fromCookie ?? (fromStorage === "nl" || fromStorage === "en" ? fromStorage : null);

    if (stored) {
      if (stored !== locale) setLocaleState(stored);
      return;
    }
    // No stored preference at all — derive from browser and persist.
    const nav = navigator.language?.toLowerCase() ?? "";
    const detected: Locale = nav.startsWith("nl") ? "nl" : nav.startsWith("en") ? "en" : "nl";
    if (detected !== locale) setLocaleState(detected);
    document.cookie = `${COOKIE_NAME}=${detected};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
    localStorage.setItem(STORAGE_KEY, detected);
    void setLocaleCookie({ data: { locale: detected } }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    if (typeof window !== "undefined") {
      // Write cookie immediately for the next SSR request.
      document.cookie = `${COOKIE_NAME}=${l};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
      localStorage.setItem(STORAGE_KEY, l);
      document.documentElement.lang = l;
      // Mirror to the server (also useful behind any caching layer).
      void setLocaleCookie({ data: { locale: l } }).catch(() => {});
    }
  }, []);

  // Keep <html lang> in sync for SEO / accessibility on every locale change.
  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = locale;
  }, [locale]);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      let str = dicts[locale]?.[key] ?? dicts.nl[key] ?? key;
      if (vars) {
        Object.entries(vars).forEach(([k, v]) => {
          str = str.replace(`{${k}}`, String(v));
        });
      }
      return str;
    },
    [locale],
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useT() {
  return useContext(I18nContext);
}
