import { useEffect, useState } from 'react';

const STUDY_DATA_EVENT = 'frp:study-data-changed';

/**
 * Broadcasts a local learning-data change so open views can recalculate
 * without a reload. Recording functions stay untouched: callers announce the
 * write after it succeeds.
 */
export function notifyStudyDataChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(STUDY_DATA_EVENT));
}

/**
 * Re-renders a page after its own actions, an import, a sync, a return to the
 * tab or a change made in another tab. Returns an incrementing version.
 */
export function useStudyDataVersion(): number {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const bump = () => setVersion((current) => current + 1);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') bump();
    };
    const handleStorage = (event: StorageEvent) => {
      if (
        event.key === 'frp:study-data' ||
        event.key === 'frp:settings' ||
        event.key === 'frp:previous-backup'
      ) {
        bump();
      }
    };

    window.addEventListener(STUDY_DATA_EVENT, bump);
    window.addEventListener('focus', bump);
    window.addEventListener('storage', handleStorage);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener(STUDY_DATA_EVENT, bump);
      window.removeEventListener('focus', bump);
      window.removeEventListener('storage', handleStorage);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return version;
}
