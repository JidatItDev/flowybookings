import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

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

export function I18nProvider({ children }: { children: ReactNode }) {
  // Always start with "nl" for SSR hydration safety
  const [locale, setLocaleState] = useState<Locale>("nl");

  // After hydration, sync from localStorage (persists across browser sessions),
  // falling back to legacy sessionStorage, then browser language.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored =
      (localStorage.getItem("flowybookings_lang") as Locale | null) ??
      (sessionStorage.getItem("flowybookings_lang") as Locale | null);
    if (stored === "nl" || stored === "en") {
      if (stored !== locale) setLocaleState(stored);
      return;
    }
    const nav = navigator.language?.toLowerCase() ?? "";
    const detected: Locale = nav.startsWith("nl") ? "nl" : nav.startsWith("en") ? "en" : "nl";
    if (detected !== locale) setLocaleState(detected);
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    if (typeof window !== "undefined") {
      localStorage.setItem("flowybookings_lang", l);
      // Also mirror to sessionStorage so any older code keeps working.
      sessionStorage.setItem("flowybookings_lang", l);
      document.documentElement.lang = l;
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
