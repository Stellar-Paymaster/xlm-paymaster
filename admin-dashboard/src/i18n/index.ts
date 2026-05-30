"use client";

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { LocaleCode, SUPPORTED_LOCALES } from "./config";
import { initI18n, changeLanguage, getCurrentLocale } from "./config";

/**
 * Component that initializes i18n on mount.
 * Must be placed inside the component tree to access localStorage.
 */
export function I18nProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initI18n();
  }, []);

  return <>{children}</>;
}

/**
 * Gets the current locale for use in server components.
 * @returns The current locale code
 */
export function useCurrentLocale(): LocaleCode {
  return getCurrentLocale();
}

/**
 * Hook for accessing translation function with proper typing.
 * @returns Translation function and i18n instance
 */
export function useTypedTranslation() {
  const { t: translation, i18n } = useTranslation();
  
  return {
    t: (key: string, fallback?: string) => {
      const value = translation(key);
      return value === key && fallback ? fallback : value;
    },
    i18n,
  };
}