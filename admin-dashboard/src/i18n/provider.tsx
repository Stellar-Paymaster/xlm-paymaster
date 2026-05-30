'use client';

import * as React from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import i18n from './i18n';

type I18nContextType = {
  t: ReturnType<typeof useTranslation>['t'];
  i18n: typeof i18n;
  changeLanguage: (language: string) => void;
};

const I18nContext = React.createContext<I18nContextType | undefined>(undefined);

type I18nProviderProps = {
  children: React.ReactNode;
};

export const I18nProvider: React.FC<I18nProviderProps> = ({ children }) => {
  const { t } = useTranslation();

  const changeLanguage = React.useCallback((language: string) => {
    i18n.changeLanguage(language);
    // Persist language selection
    if (typeof window !== 'undefined') {
      localStorage.setItem('language', language);
    }
  }, [i18n]);

  // Initialize language from localStorage on first mount
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedLanguage = localStorage.getItem('language');
      if (storedLanguage) {
        i18n.changeLanguage(storedLanguage);
      }
    }
  }, [i18n]);

  const value = React.useMemo(() => ({
    t,
    i18n,
    changeLanguage
  }), [t, i18n, changeLanguage]);

  return (
    <I18nContext.Provider value={value}>
      <I18nextProvider i18n={i18n}>
        {children}
      </I18nextProvider>
    </I18nContext.Provider>
  );
};

export const useI18n = () => {
  const context = React.useContext(I18nContext);
  if (context === undefined) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
};