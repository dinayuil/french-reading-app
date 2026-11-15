import { readJSON, writeJSON, writeJSONStrict } from './storage';
import type { Settings, ThemePreference, UiLanguage } from '../types/progress';

const UI_LANGUAGES: readonly UiLanguage[] = ['fr', 'zh'];
const THEMES: readonly ThemePreference[] = ['system', 'light', 'dark'];

export const MIN_DAILY_GOAL = 1;
export const MAX_DAILY_GOAL = 20;
export const DEFAULT_THEME: ThemePreference = 'system';
export const DEFAULT_DAILY_GOAL = 1;

export const DEFAULT_SETTINGS: Settings = {
  uiLanguage: 'fr',
  onboardingSeen: false,
  practiceTimerVisible: true,
  theme: DEFAULT_THEME,
  dailyGoal: DEFAULT_DAILY_GOAL,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUiLanguage(value: unknown): value is UiLanguage {
  return UI_LANGUAGES.includes(value as UiLanguage);
}

export function isThemePreference(
  value: unknown,
): value is ThemePreference {
  return THEMES.includes(value as ThemePreference);
}

export function isValidDailyGoal(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MIN_DAILY_GOAL &&
    value <= MAX_DAILY_GOAL
  );
}

export function loadSettings(): Settings {
  const stored = readJSON<unknown>('settings', {});
  if (!isRecord(stored)) return { ...DEFAULT_SETTINGS };

  return {
    uiLanguage: isUiLanguage(stored.uiLanguage)
      ? stored.uiLanguage
      : DEFAULT_SETTINGS.uiLanguage,
    onboardingSeen:
      typeof stored.onboardingSeen === 'boolean'
        ? stored.onboardingSeen
        : DEFAULT_SETTINGS.onboardingSeen,
    practiceTimerVisible:
      typeof stored.practiceTimerVisible === 'boolean'
        ? stored.practiceTimerVisible
        : DEFAULT_SETTINGS.practiceTimerVisible,
    theme: isThemePreference(stored.theme)
      ? stored.theme
      : DEFAULT_THEME,
    dailyGoal: isValidDailyGoal(stored.dailyGoal)
      ? stored.dailyGoal
      : DEFAULT_DAILY_GOAL,
  };
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next: Settings = { ...loadSettings(), ...patch };
  writeJSON('settings', next);
  return next;
}

/**
 * Replaces the complete settings document and lets storage errors reach the
 * caller. Used when restoring an imported backup, where a silent failure would
 * leave records and preferences from different states.
 */
export function writeSettingsStrict(settings: Settings): void {
  writeJSONStrict('settings', settings);
}
