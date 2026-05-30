'use client';

import * as React from 'react';
import { useTranslation, i18n as reactI18next } from 'react-i18next';
import i18n from './i18n';

type I18nProviderProps = {
  children: React.ReactNode;
};

export const I18nProvider: React.FC<I18nProviderProps> = ({ children }) => {
  const { t, i18n } = useTranslation();

  const changeLanguage = (language: string) => {
    i18n.changeLanguage(language);
    // Persist language selection
    localStorage.setItem('language', language);
  };

  // Initialize language from localStorage on first mount
  React.useEffect(() => {
    const storedLanguage = localStorage.getItem('language');
    if (storedLanguage) {
      i18n.changeLanguage(storedLanguage);
    }
  }, [i18n]);

  return (
    <i18next.Context.Provider value={{ t, i18n, changeLanguage }}>
      {children}
    </i18next.Context.Provider>
  );
};

// We need to import the context from react-i18next
import { i18next } from 'react-i18next';