/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { TRANSLATIONS, type AppLanguage, type Translations } from './translations.ts';

const LANG_STORAGE_KEY = 'factorio_planner_lang_v1';

interface I18nContextValue {
  lang: AppLanguage;
  setLang: (next: AppLanguage) => void;
  t: Translations;
}

const I18nContext = createContext<I18nContextValue>({
  lang: 'pt-BR',
  setLang: () => {},
  t: TRANSLATIONS['pt-BR'],
});

function loadInitialLanguage(): AppLanguage {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === 'pt-BR' || saved === 'en') return saved;
  } catch {
    // ignore storage errors
  }
  return 'pt-BR';
}

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<AppLanguage>(() => loadInitialLanguage());

  const setLang = (next: AppLanguage) => {
    setLangState(next);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      // ignore storage errors
    }
  };

  useEffect(() => {
    const dict = TRANSLATIONS[lang];
    document.documentElement.lang = lang;
    document.title = dict.meta.title;
    const descMeta = document.querySelector('meta[name="description"]');
    if (descMeta) {
      descMeta.setAttribute('content', dict.meta.description);
    }
  }, [lang]);

  return (
    <I18nContext.Provider value={{ lang, setLang, t: TRANSLATIONS[lang] }}>
      {children}
    </I18nContext.Provider>
  );
};

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
