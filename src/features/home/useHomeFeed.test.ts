import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { loadDay, loadManifest } from '../../lib/content';
import type { ArticleIndexEntry, CefrLevel } from '../../types/content';
import {
  getPageSize,
  useHomeFeed,
  type HomeFeedOptions,
} from './useHomeFeed';

vi.mock('../../lib/content', () => ({
  loadManifest: vi.fn(),
  loadDay: vi.fn(),
}));

const TODAY = '2026-11-12';

const MANIFEST_DAYS = [
  '2026-11-20',
  '2026-11-12',
  '2026-11-11',
  '2026-11-10',
  '2026-11-09',
  '2026-11-08',
  '2026-11-07',
  '2026-11-06',
  '2026-11-05',
  '2026-10-31',
  '2026-10-14',
  '2026-10-13',
];

type DayResult = { date: string; articles: ArticleIndexEntry[] };

function article(
  id: string,
  date: string,
  level: CefrLevel = 'B1',
): ArticleIndexEntry {
  return {
    id,
    title: `Article ${id}`,
    level,
    theme: 'culture',
    date,
    summary: 'Résumé de test.',
    path: `articles/${id}.json`,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
}

function renderFeed(initial: Partial<HomeFeedOptions> = {}) {
  const options: HomeFeedOptions = {
    rangeDays: 3,
    level: 'all',
    order: 'newest',
    today: TODAY,
    ...initial,
  };
  return renderHook(
    (props: HomeFeedOptions) => useHomeFeed(props),
    { initialProps: options },
  );
}

describe('getPageSize', () => {
  it('reveals one row at each layout breakpoint', () => {
    expect(getPageSize(390)).toBe(1);
    expect(getPageSize(610)).toBe(1);
    expect(getPageSize(640)).toBe(2);
    expect(getPageSize(1024)).toBe(3);
  });
});

describe('useHomeFeed', () => {
  beforeEach(() => {
    setViewportWidth(1024);
    vi.mocked(loadManifest).mockReset();
    vi.mocked(loadDay).mockReset();
    vi.mocked(loadManifest).mockResolvedValue({ days: [...MANIFEST_DAYS] });
    vi.mocked(loadDay).mockImplementation(async (date: string) => ({
      date,
      articles: [],
    }));
  });

  it('requests only the newest day in range until more is requested', async () => {
    const newest = [
      article('newest-1', '2026-11-12'),
      article('newest-2', '2026-11-12'),
    ];
    const next = [article('next-1', '2026-11-11')];
    vi.mocked(loadDay).mockImplementation(async (date: string) => ({
      date,
      articles:
        date === '2026-11-12' ? newest : date === '2026-11-11' ? next : [],
    }));

    const { result } = renderFeed();

    await waitFor(() => expect(result.current.entryCount).toBe(2));

    expect(loadManifest).toHaveBeenCalledTimes(1);
    expect(loadDay).toHaveBeenCalledTimes(1);
    expect(loadDay).toHaveBeenCalledWith('2026-11-12');
    expect(result.current.groups.map((group) => group.date)).toEqual([
      '2026-11-12',
    ]);

    act(() => result.current.loadMore());

    await waitFor(() => expect(result.current.entryCount).toBe(3));

    expect(loadDay).toHaveBeenLastCalledWith('2026-11-11');
    expect(result.current.groups.map((group) => group.date)).toEqual([
      '2026-11-12',
      '2026-11-11',
    ]);
    expect(loadDay).not.toHaveBeenCalledWith('2026-11-20');
    expect(loadDay).not.toHaveBeenCalledWith('2026-10-31');
  });

  it('reveals a day row by row before fetching the next day', async () => {
    const eight = Array.from({ length: 8 }, (_, index) =>
      article(`batch-${index + 1}`, '2026-11-12'),
    );
    vi.mocked(loadDay).mockImplementation(async (date: string) => ({
      date,
      articles:
        date === '2026-11-12'
          ? eight
          : date === '2026-11-11'
            ? [article('after-batches', '2026-11-11')]
            : [],
    }));

    const { result } = renderFeed();

    await waitFor(() => expect(result.current.entryCount).toBe(3));
    expect(result.current.groups[0].entries.map((entry) => entry.id)).toEqual([
      'batch-1',
      'batch-2',
      'batch-3',
    ]);
    expect(loadDay).toHaveBeenCalledTimes(1);

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.entryCount).toBe(6));
    expect(loadDay).toHaveBeenCalledTimes(1);

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.entryCount).toBe(8));
    expect(loadDay).toHaveBeenCalledTimes(1);

    act(() => result.current.loadMore());
    await waitFor(() =>
      expect(loadDay).toHaveBeenLastCalledWith('2026-11-11'),
    );
    await waitFor(() => expect(result.current.entryCount).toBe(9));
  });

  it('keeps later loaded cards hidden after the last day until they are revealed', async () => {
    const firstDay = Array.from({ length: 3 }, (_, index) =>
      article(`first-${index + 1}`, '2026-11-12'),
    );
    const lastDay = Array.from({ length: 8 }, (_, index) =>
      article(`last-${index + 1}`, '2026-11-10'),
    );
    vi.mocked(loadDay).mockImplementation(async (date: string) => ({
      date,
      articles:
        date === '2026-11-12'
          ? firstDay
          : date === '2026-11-10'
            ? lastDay
            : [],
    }));

    const { result } = renderFeed();

    await waitFor(() => expect(result.current.entryCount).toBe(3));

    act(() => result.current.loadMore());
    await waitFor(() =>
      expect(loadDay).toHaveBeenCalledWith('2026-11-11'),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.exhausted).toBe(true));

    // The empty middle day must not grant an extra row: the new day starts
    // with exactly one row on top of the three already visible cards.
    expect(result.current.entryCount).toBe(6);
    expect(result.current.hasMore).toBe(true);

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.entryCount).toBe(9));
    expect(result.current.hasMore).toBe(true);

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.entryCount).toBe(11));
    expect(result.current.hasMore).toBe(false);
  });

  it('automatically skips days without matches and only grants one new row', async () => {
    setViewportWidth(375);
    const matchingDay = Array.from({ length: 10 }, (_, index) =>
      article(`b2-${index + 1}`, '2026-11-10', 'B2'),
    );
    vi.mocked(loadDay).mockImplementation(async (date: string) => ({
      date,
      articles:
        date === '2026-11-12'
          ? [article('a2-1', date, 'A2')]
          : date === '2026-11-11'
            ? [article('a2-2', date, 'A2')]
            : date === '2026-11-10'
              ? matchingDay
              : [],
    }));

    const { result } = renderFeed({ level: 'B2' });

    await waitFor(() => expect(result.current.entryCount).toBe(1));

    expect(vi.mocked(loadDay).mock.calls.map(([date]) => date)).toEqual([
      '2026-11-12',
      '2026-11-11',
      '2026-11-10',
    ]);
    expect(result.current.groups.map((group) => group.date)).toEqual([
      '2026-11-10',
    ]);
    expect(result.current.groups[0].entries).toHaveLength(1);
    expect(result.current.hasMore).toBe(true);

    act(() => result.current.loadMore());

    await waitFor(() => expect(result.current.entryCount).toBe(2));
    expect(loadDay).toHaveBeenCalledTimes(3);
  });

  it('stops automatic skipping as soon as a matching card is shown', async () => {
    vi.mocked(loadDay).mockImplementation(async (date: string) => ({
      date,
      articles:
        date === '2026-11-12'
          ? [article('a2-only', date, 'A2')]
          : date === '2026-11-11'
            ? [article('b2-first', date, 'B2')]
            : date === '2026-11-10'
              ? [article('b2-second', date, 'B2')]
              : [],
    }));

    const { result } = renderFeed({ level: 'B2' });

    await waitFor(() => expect(result.current.entryCount).toBe(1));

    expect(loadDay).toHaveBeenCalledWith('2026-11-12');
    expect(loadDay).toHaveBeenCalledWith('2026-11-11');
    expect(loadDay).not.toHaveBeenCalledWith('2026-11-10');
    expect(result.current.groups[0].date).toBe('2026-11-11');

    await act(async () => {
      await Promise.resolve();
    });
    expect(loadDay).not.toHaveBeenCalledWith('2026-11-10');

    act(() => result.current.loadMore());

    await waitFor(() =>
      expect(loadDay).toHaveBeenCalledWith('2026-11-10'),
    );
    await waitFor(() => expect(result.current.entryCount).toBe(2));
  });

  it('stops automatic skipping on failure and resumes only after manual retry', async () => {
    let middleAttempts = 0;
    vi.mocked(loadDay).mockImplementation(async (date: string) => {
      if (date === '2026-11-12') {
        return { date, articles: [article('a2-first', date, 'A2')] };
      }
      if (date === '2026-11-11') {
        middleAttempts += 1;
        if (middleAttempts === 1) throw new Error('network down');
        return { date, articles: [article('a2-middle', date, 'A2')] };
      }
      return {
        date,
        articles: [article('b2-last', date, 'B2')],
      };
    });

    const { result } = renderFeed({ level: 'B2' });

    await waitFor(() => expect(result.current.dayError).not.toBeNull());
    expect(middleAttempts).toBe(1);
    expect(loadDay).not.toHaveBeenCalledWith('2026-11-10');

    await act(async () => {
      await Promise.resolve();
    });
    expect(middleAttempts).toBe(1);

    act(() => result.current.retry());

    await waitFor(() => expect(result.current.entryCount).toBe(1));
    expect(middleAttempts).toBe(2);
    expect(loadDay).toHaveBeenCalledWith('2026-11-10');
    expect(result.current.groups[0].date).toBe('2026-11-10');
  });

  it('sorts days oldest first while keeping the order inside a day', async () => {
    const first = article('same-day-1', '2026-11-10');
    const second = article('same-day-2', '2026-11-10');
    vi.mocked(loadDay).mockImplementation(async (date: string) => ({
      date,
      articles:
        date === '2026-11-10'
          ? [first, second]
          : date === '2026-11-11'
            ? [article('middle', date)]
            : [],
    }));

    const { result } = renderFeed({ order: 'oldest' });

    await waitFor(() => expect(result.current.entryCount).toBe(2));
    expect(loadDay).toHaveBeenCalledWith('2026-11-10');
    expect(result.current.groups[0].entries.map((entry) => entry.id)).toEqual([
      'same-day-1',
      'same-day-2',
    ]);

    act(() => result.current.loadMore());

    await waitFor(() => expect(result.current.entryCount).toBe(3));
    expect(result.current.groups.map((group) => group.date)).toEqual([
      '2026-11-10',
      '2026-11-11',
    ]);
  });

  it('ignores a stale response after a quick sort switch', async () => {
    const newest = deferred<DayResult>();
    const oldest = deferred<DayResult>();
    vi.mocked(loadDay).mockImplementation((date: string) => {
      if (date === '2026-11-12') return newest.promise;
      if (date === '2026-11-10') return oldest.promise;
      return Promise.resolve({ date, articles: [] });
    });

    const { result, rerender } = renderFeed();

    await waitFor(() => expect(loadDay).toHaveBeenCalledWith('2026-11-12'));

    rerender({
      rangeDays: 3,
      level: 'all',
      order: 'oldest',
      today: TODAY,
    });

    await waitFor(() => expect(loadDay).toHaveBeenCalledWith('2026-11-10'));

    await act(async () => {
      oldest.resolve({
        date: '2026-11-10',
        articles: [article('oldest-only', '2026-11-10')],
      });
    });

    await waitFor(() => expect(result.current.entryCount).toBe(1));
    expect(result.current.groups.map((group) => group.date)).toEqual([
      '2026-11-10',
    ]);

    await act(async () => {
      newest.resolve({
        date: '2026-11-12',
        articles: [article('stale-newest', '2026-11-12')],
      });
    });

    expect(result.current.entryCount).toBe(1);
    expect(result.current.groups.map((group) => group.date)).toEqual([
      '2026-11-10',
    ]);
    expect(
      result.current.groups.flatMap((group) =>
        group.entries.map((entry) => entry.id),
      ),
    ).not.toContain('stale-newest');
  });

  it('keeps loaded cards when a later day fails and retries only that day', async () => {
    let nextDayAttempts = 0;
    vi.mocked(loadDay).mockImplementation(async (date: string) => {
      if (date === '2026-11-12') {
        return {
          date,
          articles: [article('kept-card', '2026-11-12')],
        };
      }
      if (date === '2026-11-11') {
        nextDayAttempts += 1;
        if (nextDayAttempts === 1) throw new Error('network down');
        return {
          date,
          articles: [article('retried-card', '2026-11-11')],
        };
      }
      return { date, articles: [] };
    });

    const { result } = renderFeed();

    await waitFor(() => expect(result.current.entryCount).toBe(1));

    act(() => result.current.loadMore());

    await waitFor(() => expect(result.current.dayError).not.toBeNull());
    expect(result.current.entryCount).toBe(1);
    expect(result.current.groups[0].entries[0].id).toBe('kept-card');
    expect(nextDayAttempts).toBe(1);
    expect(result.current.loading).toBe(false);

    act(() => result.current.retry());

    await waitFor(() => expect(result.current.entryCount).toBe(2));
    expect(result.current.dayError).toBeNull();
    expect(nextDayAttempts).toBe(2);
    expect(result.current.groups.map((group) => group.date)).toEqual([
      '2026-11-12',
      '2026-11-11',
    ]);
  });

  it('retries a failed manifest without requesting any day', async () => {
    vi.mocked(loadManifest)
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ days: [...MANIFEST_DAYS] });
    vi.mocked(loadDay).mockImplementation(async (date: string) => ({
      date,
      articles: [article('after-manifest-retry', date)],
    }));

    const { result } = renderFeed();

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.manifestError).toBe('network down');
    expect(loadDay).not.toHaveBeenCalled();

    act(() => result.current.retry());

    await waitFor(() => expect(result.current.status).toBe('ready'));
    await waitFor(() => expect(result.current.entryCount).toBe(1));
    expect(loadManifest).toHaveBeenCalledTimes(2);
    expect(loadDay).toHaveBeenCalledWith('2026-11-12');
  });

  it('automatically reports empty only after every day in range has been checked', async () => {
    vi.mocked(loadDay).mockImplementation(async (date: string) => ({
      date,
      articles: [article(`a2-${date}`, date, 'A2')],
    }));

    const { result } = renderFeed({ level: 'B2' });

    await waitFor(() => expect(result.current.isEmpty).toBe(true));

    expect(vi.mocked(loadDay).mock.calls.map(([date]) => date)).toEqual([
      '2026-11-12',
      '2026-11-11',
      '2026-11-10',
    ]);
    expect(result.current.entryCount).toBe(0);
    expect(result.current.exhausted).toBe(true);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.loading).toBe(false);

    await act(async () => {
      await Promise.resolve();
    });
    expect(loadDay).toHaveBeenCalledTimes(3);
  });
});
