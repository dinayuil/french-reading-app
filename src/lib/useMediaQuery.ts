import { useCallback, useSyncExternalStore } from 'react';

export const MOBILE_QUERY = '(max-width: 639px)';

const getServerSnapshot = (): boolean => false;

function getMatchMedia(): typeof window.matchMedia | null {
  if (typeof window === 'undefined') return null;
  if (typeof window.matchMedia !== 'function') return null;
  return window.matchMedia;
}

/**
 * Subscribes to a CSS media query. Environments without matchMedia (SSR,
 * jsdom without a stub) render the desktop fallback.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((onStoreChange: () => void) => {
    const matchMedia = getMatchMedia();
    if (!matchMedia) return () => {};

    const mediaQueryList = matchMedia(query);
    if (typeof mediaQueryList.addEventListener === 'function') {
      mediaQueryList.addEventListener('change', onStoreChange);
      return () => mediaQueryList.removeEventListener('change', onStoreChange);
    }
    mediaQueryList.addListener(onStoreChange);
    return () => mediaQueryList.removeListener(onStoreChange);
  }, [query]);

  const getSnapshot = useCallback((): boolean => {
    const matchMedia = getMatchMedia();
    if (!matchMedia) return false;
    return matchMedia(query).matches;
  }, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
