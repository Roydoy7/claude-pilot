/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Language Context - Manages language state and translations
 */

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { Language, Translation } from './types';
import { enTranslations } from './translations/en';
import { zhTranslations } from './translations/zh';
import { jaTranslations } from './translations/ja';

interface LanguageContextType {
  language: Language;
  setLanguage: (language: Language) => void;
  t: Translation;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

interface LanguageProviderProps {
  children: ReactNode;
}

const translations: Record<Language, Translation> = {
  en: enTranslations,
  zh: zhTranslations,
  ja: jaTranslations,
};

export function LanguageProvider({ children }: LanguageProviderProps) {
  // Load language from localStorage or default to 'en'
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('language');
    return (saved === 'en' || saved === 'zh' || saved === 'ja') ? saved : 'en';
  });

  useEffect(() => {
    // Save to localStorage when language changes
    localStorage.setItem('language', language);
  }, [language]);

  const setLanguage = (newLanguage: Language) => {
    setLanguageState(newLanguage);
  };

  const value = {
    language,
    setLanguage,
    t: translations[language],
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
