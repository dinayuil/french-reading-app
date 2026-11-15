import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyTheme,
  getThemePreference,
  resolveTheme,
  setThemePreference,
  watchTheme,
} from './theme';

interface MediaController {
  matches: boolean;
  notify: (matches: boolean) => void;
}

function stubColorScheme(initialDark: boolean): MediaController {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const controller: MediaController = {
    matches: initialDark,
    notify(matches: boolean) {
      controller.matches = matches;
      for (const listener of listeners) {
        listener({ matches } as MediaQueryListEvent);
      }
    },
  };

  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      get matches() {
        return query.includes('prefers-color-scheme: dark')
          ? controller.matches
          : false;
      },
      media: query,
      onchange: null,
      addEventListener(type: string, listener: EventListener) {
        if (type === 'change') {
          listeners.add(listener as (event: MediaQueryListEvent) => void);
        }
      },
      removeEventListener(type: string, listener: EventListener) {
        if (type === 'change') {
          listeners.delete(listener as (event: MediaQueryListEvent) => void);
        }
      },
    })),
  );

  return controller;
}

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.backgroundColor = '';
    document.documentElement.style.colorScheme = '';
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = '#fbf9f4';
    document.head.appendChild(meta);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.backgroundColor = '';
    document.documentElement.style.colorScheme = '';
    document.querySelector('meta[name="theme-color"]')?.remove();
  });

  it('resolves explicit choices before the system preference', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('defaults to system and follows a dark operating system', () => {
    stubColorScheme(true);

    expect(getThemePreference()).toBe('system');
    applyTheme();

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(
      document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
        ?.content,
    ).toBe('#121518');
  });

  it('persists an explicit theme and applies it immediately', () => {
    const media = stubColorScheme(true);

    setThemePreference('light');

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(
      JSON.parse(localStorage.getItem('frp:settings') ?? '{}'),
    ).toMatchObject({ theme: 'light' });
    expect(getThemePreference()).toBe('light');

    media.notify(true);
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('reapplies the system theme when the operating system changes', () => {
    const media = stubColorScheme(false);
    applyTheme('system');
    expect(document.documentElement.dataset.theme).toBe('light');

    const stop = watchTheme();
    media.notify(true);

    expect(document.documentElement.dataset.theme).toBe('dark');
    stop();

    media.notify(false);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
