type MediaQueryChangeListener = (event: MediaQueryListEvent) => void;

interface QueryEntry {
  readonly query: string;
  readonly listeners: Set<MediaQueryChangeListener>;
}

export interface MatchMediaController {
  readonly matchMedia: (query: string) => MediaQueryList;
  setMobile: (mobile: boolean) => void;
}

/**
 * Test double for window.matchMedia that understands the app's width queries.
 * Call setMobile inside act() so useSyncExternalStore observes the change.
 */
export function createMatchMediaController(
  initialMobile: boolean,
): MatchMediaController {
  let mobile = initialMobile;
  const entries = new Set<QueryEntry>();

  const matches = (query: string): boolean => {
    if (query.includes('min-width')) return !mobile;
    return mobile;
  };

  const notify = (): void => {
    for (const entry of entries) {
      const event = {
        matches: matches(entry.query),
        media: entry.query,
      } as MediaQueryListEvent;

      for (const listener of entry.listeners) {
        listener(event);
      }
    }
  };

  return {
    matchMedia(query: string): MediaQueryList {
      const entry: QueryEntry = { query, listeners: new Set() };
      entries.add(entry);

      return {
        get matches() {
          return matches(query);
        },
        media: query,
        onchange: null,
        addEventListener(
          type: string,
          listener: EventListenerOrEventListenerObject | null,
        ) {
          if (type !== 'change' || !listener) return;
          entry.listeners.add(listener as MediaQueryChangeListener);
        },
        removeEventListener(
          type: string,
          listener: EventListenerOrEventListenerObject | null,
        ) {
          if (type !== 'change' || !listener) return;
          entry.listeners.delete(listener as MediaQueryChangeListener);
        },
        addListener(listener: MediaQueryChangeListener) {
          entry.listeners.add(listener);
        },
        removeListener(listener: MediaQueryChangeListener) {
          entry.listeners.delete(listener);
        },
        dispatchEvent() {
          return true;
        },
      } as MediaQueryList;
    },
    setMobile(next: boolean) {
      mobile = next;
      notify();
    },
  };
}
