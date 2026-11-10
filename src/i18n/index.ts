import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { loadSettings, saveSettings } from '../lib/settings';
import fr from './resources/fr';
import zh from './resources/zh';
import type { UiLanguage } from '../types/progress';

export const SUPPORTED_UI_LANGUAGES = ['fr', 'zh'] as const;

void i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    zh: { translation: zh },
  },
  lng: loadSettings().uiLanguage,
  fallbackLng: 'fr',
  supportedLngs: SUPPORTED_UI_LANGUAGES,
  interpolation: { escapeValue: false },
  initAsync: false,
});

document.documentElement.lang = i18n.language;

i18n.on('languageChanged', (language) => {
  if (!SUPPORTED_UI_LANGUAGES.includes(language as UiLanguage)) return;
  document.documentElement.lang = language;
  saveSettings({ uiLanguage: language as UiLanguage });
});

export { i18n };
