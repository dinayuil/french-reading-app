import { loadSettings, saveSettings } from './settings';
import type { Settings, ThemePreference } from '../types/progress';

export type { ThemePreference };
export type ResolvedTheme = 'light' | 'dark';

export const THEME_PREFERENCES: readonly ThemePreference[] = [
  'system',
  'light',
  'dark',
];

export const LIGHT_BACKGROUND = '#fbf9f4';
export const DARK_BACKGROUND = '#121518';
export const LIGHT_SURFACE = '#ffffff';
export const DARK_SURFACE = '#1b1f24';

const THEME_COLOR_META = 'theme-color';

export function isThemePreference(value: unknown): value is ThemePreference {
  return (
    value === 'system' || value === 'light' || value === 'dark'
  );
}

export function systemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

export function resolveTheme(
  preference: ThemePreference,
  prefersDark: boolean,
): ResolvedTheme {
  if (preference === 'dark') return 'dark';
  if (preference === 'light') return 'light';
  return prefersDark ? 'dark' : 'light';
}

export function getThemePreference(): ThemePreference {
  const settings = loadSettings() as Settings & { theme?: unknown };
  return isThemePreference(settings.theme) ? settings.theme : 'system';
}

function updateMetaThemeColor(theme: ResolvedTheme): void {
  const meta = document.querySelector<HTMLMetaElement>(
    `meta[name="${THEME_COLOR_META}"]`,
  );
  if (!meta) return;
  meta.content = theme === 'dark' ? DARK_BACKGROUND : LIGHT_BACKGROUND;
}

export function applyResolvedTheme(
  theme: ResolvedTheme,
  preference: ThemePreference = 'system',
): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  root.style.backgroundColor =
    theme === 'dark' ? DARK_BACKGROUND : LIGHT_BACKGROUND;
  updateMetaThemeColor(theme);
  // Loaded lazily so the browser build does not pull native-only code into
  // the initial chunk, and so theme/chrome modules do not import each other.
  void import('../platform/chrome')
    .then(({ syncNativeChrome }) => syncNativeChrome(theme, preference))
    .catch(() => undefined);
}

export function applyTheme(preference?: ThemePreference): ResolvedTheme {
  const next = preference ?? getThemePreference();
  const resolved = resolveTheme(next, systemPrefersDark());
  applyResolvedTheme(resolved, next);
  return resolved;
}

export function setThemePreference(preference: ThemePreference): ResolvedTheme {
  saveSettings({ theme: preference });
  return applyTheme(preference);
}

/**
 * Re-applies the stored preference when the operating system theme changes
 * or the settings key is changed in another tab. Returns an unsubscribe
 * callback; the app calls this once at startup.
 */
export function watchTheme(): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const media =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;

  const applyFromSettings = () => {
    applyTheme();
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key === 'frp:settings') applyFromSettings();
  };

  media?.addEventListener?.('change', applyFromSettings);
  window.addEventListener('storage', handleStorage);

  return () => {
    media?.removeEventListener?.('change', applyFromSettings);
    window.removeEventListener('storage', handleStorage);
  };
}
