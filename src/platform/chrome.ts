import { Capacitor, registerPlugin } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
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
 * Keeps the Android system bars in step with the in-app appearance. The
 * status bar uses the official Capacitor plugin; the navigation bar is set
 * by the small native AppChrome plugin registered in MainActivity.
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
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
    await StatusBar.setBackgroundColor({ color: barBackground });
    await StatusBar.setOverlaysWebView({ overlay: false });
  } catch {
    // The web build and older native shells may not expose the plugin.
  }

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
