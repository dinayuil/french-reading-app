import { describe, expect, it } from 'vitest';
import {
  getLearningStatistics,
  localDateKey,
} from './statistics';
import type {
  PracticeSession,
  ReadingSession,
} from '../../types/progress';
import type { StudyRecords } from '../data/studyData';

type StoredReadingSession = ReadingSession & { id: string };
type StoredPracticeSession = PracticeSession & { id: string };

const NOW = new Date(2026, 10, 15, 12, 0, 0);

function localIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
): string {
  return new Date(year, month - 1, day, hour, minute).toISOString();
}

function reading(
  id: string,
  articleId: string,
  startedAt: string,
  durationMs: number,
): StoredReadingSession {
  return { id, articleId, startedAt, durationMs };
}

function practice(
  id: string,
  articleId: string,
  startedAt: string,
  durationMs: number,
  overrides: Partial<StoredPracticeSession> = {},
): StoredPracticeSession {
  return {
    id,
    articleId,
    startedAt,
    durationMs,
    score: 1,
    total: 1,
    answers: [{ questionId: 'q1', selectedIndex: 0, correct: true }],
    markedWords: [],
    ...overrides,
  };
}

function records(
  readingSessions: StoredReadingSession[] = [],
  practiceSessions: StoredPracticeSession[] = [],
): StudyRecords {
  return { readingSessions, practiceSessions, readingProgress: [] };
}

describe('localDateKey', () => {
  it('formats a local calendar date with zero padding', () => {
    expect(localDateKey(new Date(2026, 0, 5, 0, 30))).toBe('2026-01-05');
    expect(localDateKey(new Date(2026, 10, 15, 23, 59))).toBe('2026-11-15');
  });
});

describe('learning statistics', () => {
  it('returns seven local days ending today in ascending order', () => {
    const stats = getLearningStatistics(records(), NOW);

    expect(stats.days.map((day) => day.date)).toEqual([
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
    ]);
    expect(stats.today).toEqual(stats.days[6]);
    expect(stats.today).toEqual({
      date: '2026-11-15',
      completedArticles: 0,
      readingMs: 0,
      practiceMs: 0,
      totalMs: 0,
      practiceAttempts: 0,
      correctAnswers: 0,
      totalAnswers: 0,
    });
    expect(stats).toMatchObject({
      completedArticles: 0,
      totalMs: 0,
      readingMs: 0,
      practiceMs: 0,
      activeDays: 0,
      practiceAttempts: 0,
      correctAnswers: 0,
      totalAnswers: 0,
    });
  });

  it('supports a thirty day range and falls back to seven for an invalid range', () => {
    const stats = getLearningStatistics(records(), NOW, 30);

    expect(stats.days).toHaveLength(30);
    expect(stats.days[0].date).toBe(localDateKey(new Date(2026, 9, 17)));
    expect(stats.days[29].date).toBe('2026-11-15');
    expect(getLearningStatistics(records(), NOW, 0).days).toHaveLength(7);
    expect(getLearningStatistics(records(), NOW, -3).days).toHaveLength(7);
  });

  it('attributes reading time to the local day the session started', () => {
    const stats = getLearningStatistics(
      records([
        reading('r1', 'article-a', localIso(2026, 11, 13, 10), 60_000),
        reading('r2', 'article-a', localIso(2026, 11, 13, 18), 30_000),
      ]),
      NOW,
    );

    const day = stats.days.find((item) => item.date === '2026-11-13');
    expect(day).toMatchObject({
      readingMs: 90_000,
      practiceMs: 0,
      totalMs: 90_000,
      practiceAttempts: 0,
      completedArticles: 0,
    });
    expect(stats.readingMs).toBe(90_000);
    expect(stats.practiceMs).toBe(0);
    expect(stats.totalMs).toBe(90_000);
    expect(stats.activeDays).toBe(1);
    expect(stats.completedArticles).toBe(0);
  });

  it('uses completedDay for practice time, attempts and answers across midnight', () => {
    const stats = getLearningStatistics(
      records(
        [],
        [
          practice(
            'p1',
            'article-a',
            localIso(2026, 11, 14, 23, 50),
            120_000,
            {
              completedAt: localIso(2026, 11, 15, 0, 5),
              completedDay: '2026-11-15',
              score: 1,
              total: 2,
              answers: [
                { questionId: 'q1', selectedIndex: 0, correct: true },
                { questionId: 'q2', selectedIndex: 1, correct: false },
              ],
            },
          ),
        ],
      ),
      NOW,
    );

    expect(stats.days.find((day) => day.date === '2026-11-14')).toMatchObject({
      practiceMs: 0,
      practiceAttempts: 0,
      completedArticles: 0,
    });
    expect(stats.days.find((day) => day.date === '2026-11-15')).toMatchObject({
      practiceMs: 120_000,
      totalMs: 120_000,
      practiceAttempts: 1,
      correctAnswers: 1,
      totalAnswers: 2,
      completedArticles: 1,
    });
    expect(stats.today).toEqual(
      expect.objectContaining({
        date: '2026-11-15',
        practiceMs: 120_000,
        practiceAttempts: 1,
        completedArticles: 1,
      }),
    );
  });

  it('uses completedDay exclusively when it is present', () => {
    const stats = getLearningStatistics(
      records(
        [],
        [
          practice(
            'p1',
            'article-a',
            localIso(2026, 11, 14, 12),
            60_000,
            { completedDay: '2026-11-01' },
          ),
        ],
      ),
      NOW,
    );

    expect(stats.practiceMs).toBe(0);
    expect(stats.practiceAttempts).toBe(0);
    expect(stats.completedArticles).toBe(0);
    expect(stats.activeDays).toBe(0);
  });

  it('uses the completedAt local day when completedDay is missing and startedAt for old records', () => {
    const stats = getLearningStatistics(
      records(
        [],
        [
          practice(
            'p1',
            'article-a',
            localIso(2026, 11, 14, 23, 50),
            30_000,
            { completedAt: localIso(2026, 11, 15, 0, 5) },
          ),
          practice('p2', 'article-b', localIso(2026, 11, 12, 9), 20_000),
        ],
      ),
      NOW,
    );

    expect(stats.days.find((day) => day.date === '2026-11-14')).toMatchObject({
      practiceMs: 0,
      practiceAttempts: 0,
      completedArticles: 0,
    });
    expect(stats.days.find((day) => day.date === '2026-11-15')).toMatchObject({
      practiceMs: 30_000,
      practiceAttempts: 1,
      completedArticles: 1,
    });
    expect(stats.days.find((day) => day.date === '2026-11-12')).toMatchObject({
      practiceMs: 20_000,
      practiceAttempts: 1,
      completedArticles: 1,
    });
    expect(stats.practiceMs).toBe(50_000);
  });

  it('falls back to the started day for old practice records without completion fields', () => {
    const stats = getLearningStatistics(
      records(
        [],
        [practice('p1', 'article-a', localIso(2026, 11, 12, 22), 45_000)],
      ),
      NOW,
    );

    expect(stats.days.find((day) => day.date === '2026-11-12')).toMatchObject({
      practiceMs: 45_000,
      practiceAttempts: 1,
      completedArticles: 1,
    });
    expect(stats.practiceMs).toBe(45_000);
  });

  it('counts each article once per local day and again on another day', () => {
    const stats = getLearningStatistics(
      records(
        [],
        [
          practice('p1', 'article-a', localIso(2026, 11, 15, 9), 1_000),
          practice('p2', 'article-a', localIso(2026, 11, 15, 10), 2_000),
          practice('p3', 'article-b', localIso(2026, 11, 15, 11), 3_000),
          practice('p4', 'article-a', localIso(2026, 11, 14, 11), 4_000),
        ],
      ),
      NOW,
    );

    expect(stats.days.find((day) => day.date === '2026-11-15')).toMatchObject({
      completedArticles: 2,
      practiceMs: 6_000,
      practiceAttempts: 3,
    });
    expect(stats.days.find((day) => day.date === '2026-11-14')).toMatchObject({
      completedArticles: 1,
      practiceMs: 4_000,
      practiceAttempts: 1,
    });
    expect(stats.completedArticles).toBe(3);
    expect(stats.practiceAttempts).toBe(4);
    expect(stats.practiceMs).toBe(10_000);
    expect(stats.activeDays).toBe(2);
  });

  it('counts failed attempts as daily completions without a score threshold', () => {
    const stats = getLearningStatistics(
      records(
        [],
        [
          practice('p1', 'article-a', localIso(2026, 11, 15, 9), 1_000, {
            score: 0,
            total: 2,
            answers: [
              { questionId: 'q1', selectedIndex: 0, correct: false },
              { questionId: 'q2', selectedIndex: 1, correct: false },
            ],
          }),
        ],
      ),
      NOW,
    );

    expect(stats.today.completedArticles).toBe(1);
    expect(stats.today.correctAnswers).toBe(0);
    expect(stats.today.totalAnswers).toBe(2);
  });

  it('excludes future local dates from buckets and totals', () => {
    const stats = getLearningStatistics(
      records(
        [reading('r1', 'article-a', localIso(2026, 11, 16, 10), 90_000)],
        [
          practice('p1', 'article-a', localIso(2026, 11, 16, 10), 60_000),
          practice('p2', 'article-b', localIso(2026, 11, 20, 10), 60_000),
        ],
      ),
      NOW,
    );

    expect(stats.totalMs).toBe(0);
    expect(stats.practiceAttempts).toBe(0);
    expect(stats.completedArticles).toBe(0);
    expect(stats.activeDays).toBe(0);
  });

  it('aggregates totals, active days and answers for the requested range', () => {
    const stats = getLearningStatistics(
      records(
        [reading('r1', 'article-a', localIso(2026, 11, 10, 8), 10_000)],
        [
          practice('p1', 'article-a', localIso(2026, 11, 11, 9), 5_000, {
            answers: [
              { questionId: 'q1', selectedIndex: 0, correct: true },
              { questionId: 'q2', selectedIndex: 1, correct: false },
            ],
          }),
          practice('p2', 'article-b', localIso(2026, 11, 15, 9), 7_000, {
            answers: [{ questionId: 'q1', selectedIndex: 2, correct: true }],
          }),
        ],
      ),
      NOW,
    );

    expect(stats).toMatchObject({
      completedArticles: 2,
      readingMs: 10_000,
      practiceMs: 12_000,
      totalMs: 22_000,
      activeDays: 3,
      practiceAttempts: 2,
      correctAnswers: 2,
      totalAnswers: 3,
    });
    expect(stats.today.completedArticles).toBe(1);
    expect(stats.today.totalMs).toBe(7_000);
  });

  it('ignores records older than the requested window', () => {
    const stats = getLearningStatistics(
      records(
        [reading('r1', 'article-a', localIso(2026, 10, 1, 8), 10_000)],
        [practice('p1', 'article-a', localIso(2026, 10, 1, 9), 5_000)],
      ),
      NOW,
    );

    expect(stats.totalMs).toBe(0);
    expect(stats.activeDays).toBe(0);

    const extended = getLearningStatistics(
      records(
        [reading('r1', 'article-a', localIso(2026, 10, 1, 8), 10_000)],
        [practice('p1', 'article-a', localIso(2026, 10, 1, 9), 5_000)],
      ),
      NOW,
      60,
    );
    expect(extended.totalMs).toBe(15_000);
    expect(extended.activeDays).toBe(1);
  });
});
