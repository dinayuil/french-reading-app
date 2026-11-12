import { Capacitor } from '@capacitor/core';

/**
 * True only inside the Capacitor native shell. The web/PWA build must keep
 * native-only features hidden, so callers should not infer this from the URL
 * or display mode.
 */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}
