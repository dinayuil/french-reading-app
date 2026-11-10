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
    });
  });

  it('saves only the patched fields while preserving the others', () => {
    saveSettings({ uiLanguage: 'zh', onboardingSeen: true });
    const saved = saveSettings({ practiceTimerVisible: false });

    expect(saved).toEqual({
      uiLanguage: 'zh',
      onboardingSeen: true,
      practiceTimerVisible: false,
    });
    expect(loadSettings()).toEqual(saved);
  });
});
