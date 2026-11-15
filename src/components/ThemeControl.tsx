import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getThemePreference,
  setThemePreference,
  type ThemePreference,
} from '../lib/theme';

const ICONS: Record<ThemePreference, ReactNode> = {
  system: (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <rect x="2.5" y="3.5" width="15" height="10" rx="1.6" />
      <path d="M7 16.5h6M10 13.5v3" />
    </svg>
  ),
  light: (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="3.4" />
      <path d="M10 2.2v2M10 15.8v2M2.2 10h2M15.8 10h2M4.5 4.5l1.4 1.4M14.1 14.1l1.4 1.4M15.5 4.5l-1.4 1.4M5.9 14.1l-1.4 1.4" />
    </svg>
  ),
  dark: (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M16.4 12.6A6.8 6.8 0 0 1 7.4 3.6a7 7 0 1 0 9 9Z" />
    </svg>
  ),
};

export default function ThemeControl() {
  const { t } = useTranslation();
  const [preference, setPreference] = useState<ThemePreference>(() =>
    getThemePreference(),
  );

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'frp:settings') {
        setPreference(getThemePreference());
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const choose = (next: ThemePreference) => {
    setPreference(next);
    setThemePreference(next);
  };

  return (
    <div className="theme-control">
      <div
        className="segmented theme-control__options"
        role="group"
        aria-label={t('data.appearance.label')}
      >
        {(['system', 'light', 'dark'] as const).map((option) => (
          <button
            key={option}
            type="button"
            className="segmented__button theme-control__button"
            aria-pressed={preference === option}
            onClick={() => choose(option)}
          >
            <span className="theme-control__icon">{ICONS[option]}</span>
            <span>{t(`data.appearance.${option}`)}</span>
          </button>
        ))}
      </div>
      <p className="data-card__hint">{t('data.appearance.hint')}</p>
    </div>
  );
}
