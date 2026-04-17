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

  // After hydration, sync from sessionStorage
  useEffect(() => {
    const stored = sessionStorage.getItem("bookly_lang") as Locale | null;
    if (stored && stored !== locale) setLocaleState(stored);
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    if (typeof window !== "undefined") sessionStorage.setItem("bookly_lang", l);
  }, []);

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
