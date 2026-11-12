import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadDay, loadManifest } from '../../lib/content';
import type { ArticleIndexEntry, CefrLevel } from '../../types/content';
import {
  selectDaysInRange,
  sortDayKeys,
  type HomeOrder,
  type HomeRangeDays,
} from './homeDates';

export type LevelFilter = 'all' | CefrLevel;

export interface HomeFeedOptions {
  rangeDays: HomeRangeDays;
  level: LevelFilter;
  order: HomeOrder;
  today: string;
}

export interface HomeFeedGroup {
  date: string;
  entries: ArticleIndexEntry[];
}

export interface HomeFeedError {
  date: string;
  message: string;
}

interface FeedState {
  key: string;
  loadedDays: Record<string, ArticleIndexEntry[]>;
  nextIndex: number;
  visibleCount: number;
  dayError: HomeFeedError | null;
}

export interface HomeFeedResult {
  status: 'loading' | 'error' | 'ready';
  manifestError: string | null;
  dayError: HomeFeedError | null;
  groups: HomeFeedGroup[];
  entryCount: number;
  loadedDayCount: number;
  loading: boolean;
  hasMore: boolean;
  exhausted: boolean;
  isEmpty: boolean;
  retry: () => void;
  loadMore: () => void;
}

/**
 * One row of cards at the current breakpoint. The first render shows a
 * single row (one card on phones); the viewport sentinel reveals the next
 * row only when the end of the list is near the viewport, so cards below
 * the fold stay unrendered until the reader scrolls.
 */
export function getPageSize(width: number): number {
  if (width >= 960) return 3;
  if (width >= 640) return 2;
  return 1;
}

function currentPageSize(): number {
  const width = typeof window === 'undefined' ? 1024 : window.innerWidth;
  return getPageSize(width);
}

function createFeedState(key: string): FeedState {
  return {
    key,
    loadedDays: {},
    nextIndex: 0,
    visibleCount: currentPageSize(),
    dayError: null,
  };
}

export function useHomeFeed({
  rangeDays,
  level,
  order,
  today,
}: HomeFeedOptions): HomeFeedResult {
  const [manifestDays, setManifestDays] = useState<string[] | null>(null);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [manifestLoading, setManifestLoading] = useState(true);
  const [manifestAttempt, setManifestAttempt] = useState(0);

  const [feedState, setFeedState] = useState<FeedState>(() =>
    createFeedState(''),
  );
  const [fetchingDate, setFetchingDate] = useState<string | null>(null);

  const runRef = useRef(0);
  const loadingRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setManifestLoading(true);
    setManifestError(null);
    setManifestDays(null);

    loadManifest()
      .then((manifest) => {
        if (cancelled) return;
        setManifestDays(manifest.days);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setManifestDays(null);
        setManifestError(
          error instanceof Error ? error.message : String(error),
        );
      })
      .finally(() => {
        if (!cancelled) setManifestLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [manifestAttempt]);

  const scopeDays = useMemo(() => {
    if (!manifestDays) return [];
    return sortDayKeys(
      selectDaysInRange(manifestDays, rangeDays, today),
      order,
    );
  }, [manifestDays, rangeDays, today, order]);

  const feedKey = `${rangeDays}|${order}|${level}|${today}|${scopeDays.join(',')}`;
  const starting = manifestDays !== null && feedState.key !== feedKey;
  const feed = feedState.key === feedKey ? feedState : createFeedState(feedKey);

  const fetchDay = useCallback(
    async (date: string, run: number, key: string) => {
      if (loadingRef.current || runRef.current !== run) return;

      loadingRef.current = date;
      setFetchingDate(date);
      setFeedState((previous) =>
        previous.key === key ? { ...previous, dayError: null } : previous,
      );

      try {
        const day = await loadDay(date);
        if (runRef.current !== run) return;

        setFeedState((previous) =>
          previous.key === key
            ? {
                ...previous,
                loadedDays: {
                  ...previous.loadedDays,
                  [date]: day.articles,
                },
                nextIndex: previous.nextIndex + 1,
              }
            : previous,
        );
      } catch (error) {
        if (runRef.current !== run) return;

        setFeedState((previous) =>
          previous.key === key
            ? {
                ...previous,
                dayError: {
                  date,
                  message:
                    error instanceof Error ? error.message : String(error),
                },
              }
            : previous,
        );
      } finally {
        if (runRef.current === run) {
          loadingRef.current = null;
          setFetchingDate(null);
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (!manifestDays) return;

    const run = ++runRef.current;
    loadingRef.current = null;
    setFetchingDate(null);
    setFeedState(createFeedState(feedKey));

    if (scopeDays.length > 0) {
      void fetchDay(scopeDays[0], run, feedKey);
    }
  }, [feedKey, manifestDays, scopeDays, fetchDay]);

  const matchCount = useMemo(() => {
    let total = 0;

    for (const date of scopeDays) {
      const entries = feed.loadedDays[date];
      if (!entries) continue;

      total +=
        level === 'all'
          ? entries.length
          : entries.filter((entry) => entry.level === level).length;
    }

    return total;
  }, [feed.loadedDays, level, scopeDays]);

  const groups = useMemo(() => {
    const result: HomeFeedGroup[] = [];
    let remaining = feed.visibleCount;

    for (const date of scopeDays) {
      if (remaining <= 0) break;

      const entries = feed.loadedDays[date];
      if (!entries) continue;

      const matching =
        level === 'all'
          ? entries
          : entries.filter((entry) => entry.level === level);
      if (matching.length === 0) continue;

      const visible = matching.slice(0, remaining);
      result.push({ date, entries: visible });
      remaining -= visible.length;
    }

    return result;
  }, [feed.loadedDays, feed.visibleCount, level, scopeDays]);

  const entryCount = groups.reduce(
    (total, group) => total + group.entries.length,
    0,
  );
  const exhausted = feed.nextIndex >= scopeDays.length;
  const status: HomeFeedResult['status'] = manifestLoading
    ? 'loading'
    : manifestError
      ? 'error'
      : 'ready';
  const loading =
    status === 'loading' || starting || fetchingDate !== null;
  const isEmpty =
    status === 'ready' &&
    !starting &&
    exhausted &&
    !feed.dayError &&
    entryCount === 0;
  const hasMore =
    status === 'ready' &&
    !feed.dayError &&
    (feed.visibleCount < matchCount || feed.nextIndex < scopeDays.length);

  const reserveNextDayRow = useCallback(() => {
    setFeedState((previous) =>
      previous.key === feedKey
        ? {
            ...previous,
            // Only show one row of the next day on top of the matches that
            // are already visible. Recomputing from `matchCount` prevents
            // empty days from accumulating extra quotas.
            visibleCount: matchCount + currentPageSize(),
          }
        : previous,
    );
  }, [feedKey, matchCount]);

  const loadMore = useCallback(() => {
    if (!manifestDays || manifestLoading || manifestError) return;
    if (starting || loadingRef.current || feed.dayError) return;

    if (feed.visibleCount < matchCount) {
      setFeedState((previous) =>
        previous.key === feedKey
          ? {
              ...previous,
              visibleCount: Math.min(
                previous.visibleCount + currentPageSize(),
                matchCount,
              ),
            }
          : previous,
      );
      return;
    }

    const nextDate = scopeDays[feed.nextIndex];
    if (nextDate) {
      reserveNextDayRow();
      void fetchDay(nextDate, runRef.current, feedKey);
    }
  }, [
    manifestDays,
    manifestLoading,
    manifestError,
    starting,
    feed.dayError,
    feed.visibleCount,
    feed.nextIndex,
    matchCount,
    feedKey,
    scopeDays,
    fetchDay,
    reserveNextDayRow,
  ]);

  const retry = useCallback(() => {
    if (manifestError) {
      setManifestAttempt((attempt) => attempt + 1);
      return;
    }

    if (!feed.dayError) return;
    const nextDate = scopeDays[feed.nextIndex];
    if (nextDate) {
      void fetchDay(nextDate, runRef.current, feedKey);
    }
  }, [
    manifestError,
    feed.dayError,
    feed.nextIndex,
    scopeDays,
    feedKey,
    fetchDay,
  ]);

  // While nothing matches the current level, keep checking later days
  // automatically so the empty state is truthful without extra clicks.
  // As soon as a card is visible, viewport observation takes over and no
  // further day is prefetched. A failed day stops this loop for a manual retry.
  useEffect(() => {
    if (status !== 'ready' || starting || manifestLoading || manifestError) {
      return;
    }
    if (loading || loadingRef.current || feed.dayError) return;
    if (entryCount > 0) return;
    if (feed.nextIndex >= scopeDays.length) return;

    const nextDate = scopeDays[feed.nextIndex];
    if (!nextDate) return;

    reserveNextDayRow();
    void fetchDay(nextDate, runRef.current, feedKey);
  }, [
    status,
    starting,
    manifestLoading,
    manifestError,
    loading,
    feed.dayError,
    feed.nextIndex,
    entryCount,
    scopeDays,
    feedKey,
    fetchDay,
    reserveNextDayRow,
  ]);

  return {
    status,
    manifestError,
    dayError: feed.dayError,
    groups,
    entryCount,
    loadedDayCount: feed.nextIndex,
    loading,
    hasMore,
    exhausted,
    isEmpty,
    retry,
    loadMore,
  };
}
