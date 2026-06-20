import en from "../locales/en.json";
import es from "../locales/es.json";
import fr from "../locales/fr.json";
import ja from "../locales/ja.json";
import pt from "../locales/pt.json";
import zh from "../locales/zh.json";

export type LocaleCode = "en" | "es" | "fr" | "ja" | "pt" | "zh";

export const SUPPORTED_LOCALES: LocaleCode[] = ["en", "es", "fr", "ja", "pt", "zh"];
export const DEFAULT_LOCALE: LocaleCode = "en";
export const LANGUAGE_STORAGE_KEY = "paymaster-admin-locale";

export const LOCALE_MESSAGES = {
  en,
  es,
  fr,
  ja,
  pt,
  zh,
} as const;

export function normalizeLocale(locale: string | null | undefined): LocaleCode {
  if (!locale) {
    return DEFAULT_LOCALE;
  }

  const shortLocale = locale.toLowerCase().split("-")[0] as LocaleCode;
  return SUPPORTED_LOCALES.includes(shortLocale) ? shortLocale : DEFAULT_LOCALE;
}