"use client";

import { ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { LocaleCode, SUPPORTED_LOCALES } from "../i18n/config";

interface Language {
  code: LocaleCode;
  label: string;
  flag: string;
}

const LANGUAGES: Language[] = [
  { code: "en", label: "English", flag: "🇺🇸" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "pt", label: "Português", flag: "🇧🇷" },
  { code: "zh", label: "中文", flag: "🇨🇳" },
];

/**
 * Language switcher component with dropdown selector.
 * Persists selection to localStorage and provides ARIA accessibility.
 */
export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [currentLang, setCurrentLang] = useState<Language>(LANGUAGES[0]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const currentCode = (i18n.language || "en") as LocaleCode;
    const lang = LANGUAGES.find((l) => l.code === currentCode) || LANGUAGES[0];
    setCurrentLang(lang);
  }, [i18n.language]);

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
    i18n.changeLanguage(lang.code);
    setCurrentLang(lang);
    setOpen(false);
    localStorage.setItem("fluid-admin-language", lang.code);
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
          "bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700",
          "hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-blue-500"
        )}
        aria-label="Select language"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="text-lg" aria-hidden="true">{currentLang.flag}</span>
        <span className="hidden sm:inline">{currentLang.label}</span>
        <ChevronDown className="h-4 w-4 text-gray-500" aria-hidden="true" />
      </button>

      {open && (
        <ul
          className={cn(
            "absolute right-0 mt-2 w-48 rounded-lg border border-gray-200 dark:border-gray-700",
            "bg-white dark:bg-gray-800 shadow-lg z-50 py-1"
          )}
          role="listbox"
          aria-label="Language options"
        >
          {LANGUAGES.map((lang) => (
            <li key={lang.code}>
              <button
                type="button"
                onClick={() => handleLanguageChange(lang)}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2 text-sm text-left",
                  "hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors",
                  "focus:outline-none focus:bg-gray-100 dark:focus:bg-gray-700"
                )}
                role="option"
                aria-selected={currentLang.code === lang.code}
              >
                <span className="text-lg" aria-hidden="true">{lang.flag}</span>
                <span>{lang.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}