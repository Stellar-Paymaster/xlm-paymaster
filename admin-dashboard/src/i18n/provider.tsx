"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import {
  DEFAULT_LOCALE,
  LANGUAGE_STORAGE_KEY,
  LOCALE_MESSAGES,
  normalizeLocale,
  type LocaleCode,
} from "./config";

interface DashboardLocaleContextValue {
  locale: LocaleCode;
  setLocale: (locale: LocaleCode) => void;
}

const DashboardLocaleContext = createContext<DashboardLocaleContextValue | null>(null);

export function DashboardIntlProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<LocaleCode>(DEFAULT_LOCALE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setLocale(normalizeLocale(localStorage.getItem(LANGUAGE_STORAGE_KEY)));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    localStorage.setItem(LANGUAGE_STORAGE_KEY, locale);
    document.documentElement.lang = locale;
  }, [hydrated, locale]);

  const value = useMemo(() => ({ locale, setLocale }), [locale]);

  return (
    <DashboardLocaleContext.Provider value={value}>
      <NextIntlClientProvider locale={locale} messages={LOCALE_MESSAGES[locale]} timeZone="UTC">
        {children}
      </NextIntlClientProvider>
    </DashboardLocaleContext.Provider>
  );
}

export function useDashboardLocale() {
  const context = useContext(DashboardLocaleContext);

  if (!context) {
    throw new Error("useDashboardLocale must be used within DashboardIntlProvider");
  }

  return context;
}
