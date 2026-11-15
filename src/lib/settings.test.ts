import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings';

const KEY = 'frp:settings';

function store(value: unknown): void {
  localStorage.setItem(KEY, JSON.stringify(value));
}

describe('settings', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('returns the defaults when nothing is stored', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toEqual({
      uiLanguage: 'fr',
      onboardingSeen: false,
      practiceTimerVisible: true,
      theme: 'system',
      dailyGoal: 1,
    });
  });

  it('merges partial stored settings with the defaults', () => {
    store({ practiceTimerVisible: false });

    expect(loadSettings()).toEqual({
      ...DEFAULT_SETTINGS,
      practiceTimerVisible: false,
    });
  });

  it('falls back to the defaults when the stored JSON is corrupt', () => {
    localStorage.setItem(KEY, '{not json');

    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('falls back to the defaults when the stored value is not an object', () => {
    store(null);
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);

    store([1, 2, 3]);
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('falls back to French when uiLanguage is not supported', () => {
    store({ uiLanguage: 'en' });

    expect(loadSettings().uiLanguage).toBe('fr');
  });

  it('ignores fields with the wrong type', () => {
    store({
      uiLanguage: 'zh',
      onboardingSeen: 'yes',
      practiceTimerVisible: 0,
    });

    expect(loadSettings()).toEqual({
      uiLanguage: 'zh',
      onboardingSeen: false,
      practiceTimerVisible: true,
      theme: 'system',
      dailyGoal: 1,
    });
  });

  it('saves only the patched fields while preserving the others', () => {
    saveSettings({ uiLanguage: 'zh', onboardingSeen: true });
    const saved = saveSettings({ practiceTimerVisible: false });

    expect(saved).toEqual({
      uiLanguage: 'zh',
      onboardingSeen: true,
      practiceTimerVisible: false,
      theme: 'system',
      dailyGoal: 1,
    });
    expect(loadSettings()).toEqual(saved);
  });

  it('fills theme and daily goal defaults for settings stored by older versions', () => {
    store({
      uiLanguage: 'zh',
      onboardingSeen: true,
      practiceTimerVisible: false,
    });

    expect(loadSettings()).toEqual({
      uiLanguage: 'zh',
      onboardingSeen: true,
      practiceTimerVisible: false,
      theme: 'system',
      dailyGoal: 1,
    });
  });

  it('loads every supported theme and the daily goal boundaries', () => {
    for (const theme of ['system', 'light', 'dark'] as const) {
      store({ theme });
      expect(loadSettings().theme).toBe(theme);
    }

    for (const dailyGoal of [1, 20]) {
      store({ dailyGoal });
      expect(loadSettings().dailyGoal).toBe(dailyGoal);
    }
  });

  it('falls back per field when theme or daily goal is malformed', () => {
    const malformed = [
      { theme: 'auto' },
      { theme: null },
      { dailyGoal: 0 },
      { dailyGoal: 21 },
      { dailyGoal: 1.5 },
      { dailyGoal: '3' },
      { dailyGoal: Number.NaN },
    ];

    for (const stored of malformed) {
      store(stored);
      const loaded = loadSettings();
      expect(loaded.theme).toBe('system');
      expect(loaded.dailyGoal).toBe(1);
    }
  });

  it('persists theme and daily goal patches without touching other settings', () => {
    saveSettings({ uiLanguage: 'zh', practiceTimerVisible: false });
    const saved = saveSettings({ theme: 'dark', dailyGoal: 12 });

    expect(saved).toEqual({
      uiLanguage: 'zh',
      onboardingSeen: false,
      practiceTimerVisible: false,
      theme: 'dark',
      dailyGoal: 12,
    });
    expect(loadSettings()).toEqual(saved);
  });
});
