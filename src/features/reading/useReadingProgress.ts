import { useEffect, useRef } from 'react';
import type { ReadingProgress } from '../../types/progress';
import {
  getReadingProgress,
  saveReadingProgress,
} from '../data/studyData';
import {
  isAtReadingEnd,
  readingPosition,
  scrollTopForPosition,
} from './position';
import type { ScrollMetrics } from './position';

const SCROLL_SAVE_DELAY_MS = 200;

function currentMetrics(): ScrollMetrics {
  const scrolling = document.scrollingElement ?? document.documentElement;
  const scrollTop =
    typeof window.scrollY === 'number'
      ? window.scrollY
      : scrolling.scrollTop;
  return {
    scrollTop,
    scrollHeight: scrolling.scrollHeight,
    viewportHeight: window.innerHeight,
  };
}

/**
 * Restores an unfinished position once, then records position/completion as
 * the reader scrolls. Completion is sticky and storage writes re-check the
 * latest record so an import or another tab cannot be overwritten by stale
 * in-memory data.
 *
 * Metrics are captured only while the reading page is still mounted. Cleanup
 * reuses the last captured metrics instead of reading the document after a
 * route change, where it would see the next page's scroll dimensions.
 */
export function useReadingProgress(articleId: string): void {
  const lastSavedRef = useRef<ReadingProgress | null>(null);
  const latestMetricsRef = useRef<ScrollMetrics | null>(null);
  const restorePendingRef = useRef(false);

  useEffect(() => {
    const stored = getReadingProgress(articleId);
    lastSavedRef.current = stored;
    latestMetricsRef.current = null;
    const needsRestore =
      stored !== null && !stored.completed && stored.position > 0;
    restorePendingRef.current = needsRestore;

    const persistMetrics = (metrics: ScrollMetrics) => {
      const previous = lastSavedRef.current;
      const position = readingPosition(metrics);
      const completed =
        previous?.completed === true || isAtReadingEnd(metrics);

      if (!previous && position === 0 && !completed) return;
      if (
        previous &&
        previous.position === position &&
        previous.completed === completed
      ) {
        return;
      }

      const next: ReadingProgress = {
        articleId,
        position,
        completed,
        updatedAt: new Date().toISOString(),
      };
      saveReadingProgress(next);
      lastSavedRef.current = next;
    };

    const persistLatestMetrics = () => {
      const metrics = latestMetricsRef.current;
      if (metrics) persistMetrics(metrics);
    };

    let throttleTimer: number | null = null;
    const handleScroll = () => {
      if (restorePendingRef.current) return;
      latestMetricsRef.current = currentMetrics();
      if (throttleTimer !== null) return;
      throttleTimer = window.setTimeout(() => {
        throttleTimer = null;
        persistLatestMetrics();
      }, SCROLL_SAVE_DELAY_MS);
    };

    const handlePageHide = () => {
      if (!restorePendingRef.current) {
        latestMetricsRef.current = currentMetrics();
      }
      persistLatestMetrics();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') return;
      if (!restorePendingRef.current) {
        latestMetricsRef.current = currentMetrics();
      }
      persistLatestMetrics();
    };

    let restoreFrame: number | null = null;
    let restoreTimer: number | null = null;
    if (needsRestore && stored) {
      const restore = () => {
        if (restoreFrame !== null) restoreFrame = null;
        if (restoreTimer !== null) restoreTimer = null;
        const metrics = currentMetrics();
        window.scrollTo(
          0,
          scrollTopForPosition(
            stored.position,
            metrics.scrollHeight,
            metrics.viewportHeight,
          ),
        );
        restorePendingRef.current = false;
      };

      if (typeof window.requestAnimationFrame === 'function') {
        restoreFrame = window.requestAnimationFrame(restore);
      } else {
        restoreTimer = window.setTimeout(restore, 0);
      }
    } else {
      restorePendingRef.current = false;
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange,
      );
      if (throttleTimer !== null) window.clearTimeout(throttleTimer);
      if (restoreFrame !== null) window.cancelAnimationFrame(restoreFrame);
      if (restoreTimer !== null) window.clearTimeout(restoreTimer);
      // Never read the next route's DOM here; only flush metrics captured on
      // the page that was actually being read.
      persistLatestMetrics();
    };
  }, [articleId]);
}
