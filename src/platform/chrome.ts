import { Capacitor, registerPlugin } from '@capacitor/core';
import type { ResolvedTheme, ThemePreference } from '../lib/theme';
import {
  DARK_BACKGROUND,
  DARK_SURFACE,
  LIGHT_BACKGROUND,
  LIGHT_SURFACE,
} from '../lib/theme';

interface AppChromePlugin {
  apply(options: {
    dark: boolean;
    background: string;
    barBackground: string;
    system: boolean;
  }): Promise<void>;
}

const AppChrome = registerPlugin<AppChromePlugin>('AppChrome');

let lastApplied: string | null = null;

/**
 * Keeps the Android system bars in step with the in-app appearance.
 */
export async function syncNativeChrome(
  theme: ResolvedTheme,
  preference: ThemePreference = 'system',
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const cacheKey = `${theme}:${preference}`;
  if (lastApplied === cacheKey) return;
  lastApplied = cacheKey;

  const dark = theme === 'dark';
  const background = dark ? DARK_BACKGROUND : LIGHT_BACKGROUND;
  const barBackground = dark ? DARK_SURFACE : LIGHT_SURFACE;

  try {
    await AppChrome.apply({
      dark,
      background,
      barBackground,
      system: preference === 'system',
    });
  } catch {
    // A missing native plugin must never interrupt the web interface.
  }
}
