import { afterEach, describe, expect, it } from 'vitest';
import { i18n, SUPPORTED_UI_LANGUAGES } from './index';

describe('i18n', () => {
  afterEach(async () => {
    await i18n.changeLanguage('fr');
    localStorage.clear();
  });

  it('defaults to French and syncs <html lang>', () => {
    expect(i18n.language).toBe('fr');
    expect(document.documentElement.lang).toBe('fr');
  });

  it('exposes the supported UI languages', () => {
    expect(SUPPORTED_UI_LANGUAGES).toEqual(['fr', 'zh']);
  });

  it('switches to Chinese, persists the choice and syncs <html lang>', async () => {
    await i18n.changeLanguage('zh');

    expect(i18n.language).toBe('zh');
    expect(document.documentElement.lang).toBe('zh');
    expect(
      JSON.parse(localStorage.getItem('frp:settings') ?? '{}'),
    ).toMatchObject({ uiLanguage: 'zh' });
  });

  it('declares French as the fallback language', () => {
    const fallback = i18n.options.fallbackLng;
    const fallbacks = Array.isArray(fallback) ? fallback : [fallback];

    expect(fallbacks).toContain('fr');
  });
});
