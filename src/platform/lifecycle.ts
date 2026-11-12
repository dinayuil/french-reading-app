import { App } from '@capacitor/app';
import { isNativeApp } from './runtime';

/**
 * Install the Android hardware back-button handler. It walks the WebView
 * history first and exits the app only when there is nowhere left to go.
 * Returns a cleanup function and is a no-op in the browser.
 */
export async function initializeNativeApp(): Promise<() => void> {
  if (!isNativeApp()) {
    return () => undefined;
  }

  const listener = await App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
      return;
    }
    void App.exitApp();
  });

  return () => {
    void listener.remove();
  };
}
