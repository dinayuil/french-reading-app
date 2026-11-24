import { Capacitor } from '@capacitor/core';

/**
 * Identifies the Capacitor shell for Android-specific APIs.
 */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}
