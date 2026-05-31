"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { type LocaleCode } from "./config";
import { useDashboardLocale } from "./provider";

interface Language {
  code: LocaleCode;
  label: string;
  flag: string;
}

const LANGUAGES: Language[] = [
  { code: "en", label: "English", flag: "🇺🇸" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "ja", label: "日本語", flag: "🇯🇵" },
  { code: "pt", label: "Português", flag: "🇧🇷" },
  { code: "zh", label: "中文", flag: "🇨🇳" },
];

export function LanguageSwitcher() {
  const t = useTranslations("languageSwitcher");
  const { locale, setLocale } = useDashboardLocale();
  const [open, setOpen] = useState(false);
  const [currentLang, setCurrentLang] = useState<Language>(LANGUAGES[0]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrentLang(LANGUAGES.find((entry) => entry.code === locale) || LANGUAGES[0]);
  }, [locale]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleLanguageChange(lang: Language) {
    setLocale(lang.code);
    setCurrentLang(lang);
    setOpen(false);
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium",
          "transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500",
        )}
        aria-label={t("select")}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="text-lg" aria-hidden="true">
          {currentLang.flag}
        </span>
        <span className="hidden sm:inline">{currentLang.label}</span>
        <ChevronDown className="h-4 w-4 text-slate-500" aria-hidden="true" />
      </button>

      {open ? (
        <ul
          className="absolute right-0 z-50 mt-2 w-52 rounded-2xl border border-slate-200 bg-white py-1 shadow-lg"
          role="listbox"
          aria-label={t("options")}
        >
          {LANGUAGES.map((lang) => (
            <li key={lang.code}>
              <button
                type="button"
                onClick={() => handleLanguageChange(lang)}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors",
                  "hover:bg-slate-100 focus:bg-slate-100 focus:outline-none",
                )}
                role="option"
                aria-selected={currentLang.code === lang.code}
              >
                <span className="text-lg" aria-hidden="true">
                  {lang.flag}
                </span>
                <span>{lang.label}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
