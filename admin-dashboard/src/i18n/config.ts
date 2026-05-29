import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../locales/en.json";
import es from "../locales/es.json";
import pt from "../locales/pt.json";
import zh from "../locales/zh.json";

export type LocaleCode = "en" | "es" | "pt" | "zh";

export const SUPPORTED_LOCALES: LocaleCode[] = ["en", "es", "pt", "zh"];
export const DEFAULT_LOCALE: LocaleCode = "en";
export const LANGUAGE_STORAGE_KEY = "fluid-admin-language";

/**
 * Initializes i18next with configured translations.
 * Should be called once on app startup.
 */
export function initI18n(): void {
  const storedLocale = typeof window !== "undefined"
    ? (localStorage.getItem(LANGUAGE_STORAGE_KEY) as LocaleCode | null)
    : null;
  
  const initialLocale = storedLocale && SUPPORTED_LOCALES.includes(storedLocale)
    ? storedLocale
    : DEFAULT_LOCALE;

  i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      es: { translation: es },
      pt: { translation: pt },
      zh: { translation: zh },
    },
    lng: initialLocale,
    fallbackLng: DEFAULT_LOCALE,
    interpolation: {
      escapeValue: false,
    },
  });
}

/**
 * Gets the current locale from i18next.
 * @returns The current locale code
 */
export function getCurrentLocale(): LocaleCode {
  return (i18n.language || DEFAULT_LOCALE) as LocaleCode;
}

/**
 * Changes the current language and persists to localStorage.
 * @param locale - The locale code to switch to
 */
export function changeLanguage(locale: LocaleCode): void {
  if (!SUPPORTED_LOCALES.includes(locale)) {
    locale = DEFAULT_LOCALE;
  }
  i18n.changeLanguage(locale);
  if (typeof window !== "undefined") {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, locale);
  }
}

/**
 * Gets a translation value by key with optional fallback.
 * @param key - Translation key path (dot notation)
 * @param fallback - Fallback text if key not found
 * @returns Translated string or fallback
 */
export function t(key: string, fallback?: string): string {
  const value = i18n.t(key);
  return value === key && fallback ? fallback : value;
}

export default i18n;