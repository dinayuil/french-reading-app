import { useCallback, useEffect, useState } from 'react';
import { useVisibleDuration } from '../../lib/time';
import {
  createRecordId,
  saveReadingSession,
} from '../data/studyData';

export const READING_CHECKPOINT_MS = 15_000;

/**
 * Keeps one reading session per article view and checkpoints it while the
 * reader stays in the foreground. The same stable id is upserted, so pagehide,
 * visibility changes and unmount update one record instead of appending
 * duplicates.
 */
export function useReadingSession(articleId: string): void {
  const [sessionId] = useState(() => createRecordId('reading'));
  const [startedAt] = useState(() => new Date().toISOString());
  const { getElapsedMs } = useVisibleDuration(true);

  const persist = useCallback(() => {
    const durationMs = getElapsedMs();
    if (durationMs < 1_000) return;
    saveReadingSession({
      id: sessionId,
      articleId,
      startedAt,
      durationMs,
    });
  }, [articleId, getElapsedMs, sessionId, startedAt]);

  useEffect(() => {
    const handlePageHide = () => persist();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') persist();
    };
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') persist();
    }, READING_CHECKPOINT_MS);

    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      persist();
    };
  }, [persist]);
}
