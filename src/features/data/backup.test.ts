import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_BACKUP_BYTES,
  applyBackup,
  createBackup,
  getStudySummary,
  hasPreviousBackup,
  mergeBackups,
  parseBackup,
  readStudyData,
  restorePreviousBackup,
} from './backup';
import {
  PREVIOUS_BACKUP_KEY,
  getReadingProgress,
  savePracticeSession,
  saveReadingProgress,
  saveReadingSession,
} from './studyData';
import { DEFAULT_SETTINGS } from '../../lib/settings';
import type { StudyBackup, StudyData } from './backup';
import type {
  PracticeAnswer,
  PracticeSession,
  ReadingProgress,
  ReadingSession,
  Settings,
} from '../../types/progress';

const T0 = '2026-10-31T10:00:00.000Z';
const T1 = '2026-11-01T10:00:00.000Z';
const T2 = '2026-11-02T10:00:00.000Z';
const T3 = '2026-11-03T10:00:00.000Z';

const frSettings: Settings = { ...DEFAULT_SETTINGS };
const zhSettings: Settings = {
  uiLanguage: 'zh',
  onboardingSeen: true,
  practiceTimerVisible: false,
};

type StoredReadingSession = ReadingSession & { id: string };
type StoredPracticeSession = PracticeSession & { id: string };

function readingSession(
  overrides: Partial<StoredReadingSession> = {},
): StoredReadingSession {
  return {
    id: 'reading-a',
    articleId: 'article-a',
    startedAt: T1,
    durationMs: 1_000,
    ...overrides,
  };
}

function practiceSession(
  overrides: Partial<StoredPracticeSession> = {},
): StoredPracticeSession {
  return {
    id: 'practice-a',
    articleId: 'article-a',
    startedAt: T1,
    durationMs: 2_000,
    score: 1,
    total: 2,
    answers: [
      { questionId: 'q1', selectedIndex: 1, correct: true },
      { questionId: 'q2', selectedIndex: null, correct: false },
    ],
    markedWords: ['mot'],
    ...overrides,
  };
}

function progress(
  overrides: Partial<ReadingProgress> = {},
): ReadingProgress {
  return {
    articleId: 'article-a',
    position: 0.5,
    completed: false,
    updatedAt: T2,
    ...overrides,
  };
}

function makeData(overrides: Partial<StudyData> = {}): StudyData {
  return {
    readingSessions: [],
    practiceSessions: [],
    readingProgress: [],
    settings: { ...frSettings },
    ...overrides,
  };
}

function makeBackup(
  data: StudyData = makeData(),
  exportedAt = T3,
): StudyBackup {
  return {
    format: 'frp-study-backup',
    version: 1,
    exportedAt,
    data,
  };
}

function seedSettings(settings: Settings): void {
  localStorage.setItem('frp:settings', JSON.stringify(settings));
}

describe('study backups', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('creates a versioned backup from current data without writing storage', () => {
    saveReadingSession(readingSession());
    seedSettings(zhSettings);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    const backup = createBackup();

    expect(setItem).not.toHaveBeenCalled();
    expect(backup.format).toBe('frp-study-backup');
    expect(backup.version).toBe(1);
    expect(new Date(backup.exportedAt).toISOString()).toBe(backup.exportedAt);
    expect(backup.data.settings).toEqual(zhSettings);
    expect(backup.data.readingSessions).toHaveLength(1);
    expect(parseBackup(JSON.stringify(backup))).toEqual(backup);
  });

  it('reads legacy sessions with stable ids and still merges old data on the first write', () => {
    localStorage.setItem(
      'frp:reading-sessions',
      JSON.stringify([
        {
          articleId: 'legacy-article',
          startedAt: T1,
          durationMs: 1_200,
        },
      ]),
    );
    localStorage.setItem(
      'frp:practice-sessions',
      JSON.stringify([
        {
          articleId: 'legacy-article',
          startedAt: T1,
          durationMs: 3_000,
          score: 1,
          total: 2,
          answers: [
            { questionId: 'q1', selectedIndex: 1, correct: true },
            { questionId: 'q2', selectedIndex: null, correct: false },
          ],
          markedWords: ['ancien'],
        },
      ]),
    );

    const first = readStudyData();
    expect(first.readingSessions).toHaveLength(1);
    expect(first.readingSessions[0]).toMatchObject({
      articleId: 'legacy-article',
      startedAt: T1,
      durationMs: 1_200,
    });
    expect(first.readingSessions[0].id).toEqual(expect.any(String));
    expect(first.practiceSessions[0]).toMatchObject({
      articleId: 'legacy-article',
      markedWords: ['ancien'],
    });
    expect(first.practiceSessions[0].id).toEqual(expect.any(String));
    expect(localStorage.getItem('frp:study-data')).toBeNull();

    const second = readStudyData();
    expect(second.readingSessions[0].id).toBe(first.readingSessions[0].id);
    expect(second.practiceSessions[0].id).toBe(first.practiceSessions[0].id);

    savePracticeSession(
      practiceSession({ id: 'new-practice', articleId: 'new-article' }),
    );

    const migrated = readStudyData();
    expect(migrated.readingSessions).toHaveLength(1);
    expect(migrated.practiceSessions.map((item) => item.id)).toEqual([
      first.practiceSessions[0].id,
      'new-practice',
    ]);
  });

  it('upserts a reading session with the same id instead of appending duplicates', () => {
    saveReadingSession(readingSession({ durationMs: 1_000 }));
    saveReadingSession(readingSession({ durationMs: 5_000 }));

    const data = readStudyData();
    expect(data.readingSessions).toHaveLength(1);
    expect(data.readingSessions[0].durationMs).toBe(5_000);
    expect(data.readingSessions[0].id).toBe('reading-a');
  });

  it('upserts practice sessions by id', () => {
    savePracticeSession(practiceSession({ score: 0 }));
    savePracticeSession(practiceSession({ score: 2 }));

    const data = readStudyData();
    expect(data.practiceSessions).toHaveLength(1);
    expect(data.practiceSessions[0].score).toBe(2);
  });

  it('keeps only the latest reading progress for an article', () => {
    saveReadingProgress(
      progress({ position: 0.2, completed: true, updatedAt: T1 }),
    );
    saveReadingProgress(
      progress({ position: 0.8, completed: false, updatedAt: T2 }),
    );

    expect(getReadingProgress('article-a')).toMatchObject({
      position: 0.8,
      completed: false,
      updatedAt: T2,
    });

    saveReadingProgress(
      progress({ position: 0.1, completed: false, updatedAt: T0 }),
    );
    expect(getReadingProgress('article-a')?.position).toBe(0.8);

    saveReadingProgress(
      progress({ position: 0.95, completed: true, updatedAt: T3 }),
    );
    const data = readStudyData();
    expect(data.readingProgress).toHaveLength(1);
    expect(data.readingProgress[0].position).toBe(0.95);
    expect(data.readingProgress[0].completed).toBe(true);
  });

  it('merges two devices by id without adding duplicate time or results', () => {
    const local = makeBackup(
      makeData({
        readingSessions: [readingSession()],
        practiceSessions: [practiceSession()],
        readingProgress: [
          progress({ position: 0.8, completed: true, updatedAt: T3 }),
        ],
        settings: zhSettings,
      }),
    );
    const remote = makeBackup(
      makeData({
        readingSessions: [
          readingSession({ id: 'reading-b', articleId: 'article-b' }),
        ],
        practiceSessions: [
          practiceSession({ id: 'practice-a', markedWords: ['mot', 'autre'] }),
          practiceSession({ id: 'practice-b', articleId: 'article-b' }),
        ],
        readingProgress: [
          progress({ articleId: 'article-a', position: 0.2, updatedAt: T1 }),
          progress({ articleId: 'article-b', position: 0.4, updatedAt: T2 }),
        ],
        settings: frSettings,
      }),
    );

    const merged = mergeBackups(local, remote);

    expect(merged.data.readingSessions.map((item) => item.id).sort()).toEqual([
      'reading-a',
      'reading-b',
    ]);
    expect(merged.data.practiceSessions.map((item) => item.id).sort()).toEqual([
      'practice-a',
      'practice-b',
    ]);
    expect(
      merged.data.practiceSessions.find((item) => item.id === 'practice-a')
        ?.score,
    ).toBe(1);
    expect(
      merged.data.practiceSessions.find((item) => item.id === 'practice-a')
        ?.markedWords,
    ).toEqual(['mot', 'autre']);
    expect(merged.data.readingProgress).toHaveLength(2);
    expect(
      merged.data.readingProgress.find(
        (item) => item.articleId === 'article-a',
      ),
    ).toMatchObject({ position: 0.8, completed: true });
    expect(merged.data.settings).toEqual(zhSettings);
    expect(() => parseBackup(merged)).not.toThrow();
  });

  it('converges duplicate reading session checkpoints to the larger duration in both directions', () => {
    const short = makeBackup(
      makeData({
        readingSessions: [readingSession({ durationMs: 15_000 })],
      }),
    );
    const long = makeBackup(
      makeData({
        readingSessions: [readingSession({ durationMs: 60_000 })],
      }),
    );

    for (const [left, right] of [
      [short, long],
      [long, short],
    ] as const) {
      const merged = mergeBackups(left, right);
      expect(merged.data.readingSessions).toHaveLength(1);
      expect(merged.data.readingSessions[0].durationMs).toBe(60_000);
    }

    const repeated = mergeBackups(
      mergeBackups(long, long),
      makeBackup(
        makeData({
          readingSessions: [readingSession({ durationMs: 60_000 })],
        }),
      ),
    );
    expect(repeated.data.readingSessions).toHaveLength(1);
    expect(repeated.data.readingSessions[0].durationMs).toBe(60_000);
    expect(getStudySummary(repeated.data).readingMs).toBe(60_000);
  });

  it('rejects same-id session records whose identity is inconsistent', () => {
    const local = makeBackup(
      makeData({ readingSessions: [readingSession()] }),
    );
    const otherArticle = makeBackup(
      makeData({
        readingSessions: [readingSession({ articleId: 'article-b' })],
      }),
    );
    const otherStart = makeBackup(
      makeData({
        readingSessions: [readingSession({ startedAt: T2 })],
      }),
    );

    expect(() => mergeBackups(local, otherArticle)).toThrow();
    expect(() => mergeBackups(local, otherStart)).toThrow();
  });

  it('merges post-submit practice marked words without duplicating time or scores', () => {
    const localSession = practiceSession({
      markedWords: ['un'],
      score: 2,
      total: 2,
      answers: [
        { questionId: 'q1', selectedIndex: 1, correct: true },
        { questionId: 'q2', selectedIndex: 0, correct: true },
      ],
    });
    const local = makeBackup(
      makeData({ practiceSessions: [localSession] }),
    );
    const remote = makeBackup(
      makeData({
        practiceSessions: [
          practiceSession({
            ...localSession,
            markedWords: ['deux', 'un'],
          }),
        ],
      }),
    );

    const merged = mergeBackups(local, remote);

    expect(merged.data.practiceSessions).toHaveLength(1);
    expect(merged.data.practiceSessions[0]).toMatchObject({
      id: localSession.id,
      durationMs: localSession.durationMs,
      score: 2,
      total: 2,
    });
    expect(merged.data.practiceSessions[0].markedWords).toEqual(['un', 'deux']);
    expect(getStudySummary(merged.data).practiceMs).toBe(
      localSession.durationMs,
    );
    expect(getStudySummary(merged.data).practiceAttempts).toBe(1);
  });

  it('rejects practice records with inconsistent scores or answers', () => {
    const local = makeBackup(
      makeData({ practiceSessions: [practiceSession()] }),
    );
    const otherScore = makeBackup(
      makeData({
        practiceSessions: [practiceSession({ score: 0 })],
      }),
    );
    const otherAnswers = makeBackup(
      makeData({
        practiceSessions: [
          practiceSession({
            answers: [
              { questionId: 'q1', selectedIndex: 1, correct: true },
              { questionId: 'q2', selectedIndex: 0, correct: true },
            ],
          }),
        ],
      }),
    );

    expect(() => mergeBackups(local, otherScore)).toThrow();
    expect(() => mergeBackups(local, otherAnswers)).toThrow();
  });

  it('converges duplicate records inside one file instead of keeping the last one', () => {
    const duplicateReading = makeBackup(
      makeData({
        readingSessions: [
          readingSession({ durationMs: 60_000 }),
          readingSession({ durationMs: 15_000 }),
        ],
      }),
    );
    const duplicatePractice = makeBackup(
      makeData({
        practiceSessions: [
          practiceSession({ markedWords: ['deux', 'un'] }),
          practiceSession({ markedWords: ['un'] }),
        ],
      }),
    );

    expect(
      parseBackup(duplicateReading).data.readingSessions[0].durationMs,
    ).toBe(60_000);
    expect(
      parseBackup(duplicatePractice).data.practiceSessions[0].markedWords,
    ).toEqual(['deux', 'un']);
  });

  it('reports whether a usable previous backup exists without deleting it', () => {
    expect(hasPreviousBackup()).toBe(false);

    const previous = makeBackup(
      makeData({
        readingSessions: [readingSession()],
        settings: zhSettings,
      }),
    );
    const previousRaw = JSON.stringify(previous);
    localStorage.setItem(`frp:${PREVIOUS_BACKUP_KEY}`, previousRaw);

    expect(hasPreviousBackup()).toBe(true);

    localStorage.setItem(`frp:${PREVIOUS_BACKUP_KEY}`, '{not json');
    expect(hasPreviousBackup()).toBe(false);
    expect(localStorage.getItem(`frp:${PREVIOUS_BACKUP_KEY}`)).toBe(
      '{not json',
    );

    localStorage.setItem(
      `frp:${PREVIOUS_BACKUP_KEY}`,
      JSON.stringify({ ...previous, version: 2 }),
    );
    expect(hasPreviousBackup()).toBe(false);
    expect(localStorage.getItem(`frp:${PREVIOUS_BACKUP_KEY}`)).not.toBeNull();

    localStorage.removeItem(`frp:${PREVIOUS_BACKUP_KEY}`);
    expect(hasPreviousBackup()).toBe(false);
  });

  it('applies a merge idempotently and never replaces local settings', () => {
    seedSettings(zhSettings);
    saveReadingSession(readingSession());
    const remote = makeBackup(
      makeData({
        readingSessions: [
          readingSession({ id: 'reading-b', articleId: 'article-b' }),
        ],
        practiceSessions: [practiceSession({ id: 'practice-b' })],
        readingProgress: [progress({ position: 0.6, updatedAt: T2 })],
        settings: frSettings,
      }),
    );

    applyBackup(remote, 'merge');
    applyBackup(remote, 'merge');

    const data = readStudyData();
    expect(data.readingSessions).toHaveLength(2);
    expect(data.practiceSessions).toHaveLength(1);
    expect(data.readingProgress).toHaveLength(1);
    expect(data.settings).toEqual(zhSettings);
    expect(localStorage.getItem('frp:settings')).toBe(
      JSON.stringify(zhSettings),
    );
  });

  it('replaces data and settings, then restores the previous backup', () => {
    seedSettings(zhSettings);
    saveReadingSession(readingSession());
    const replacement = makeBackup(
      makeData({
        readingSessions: [
          readingSession({ id: 'reading-b', articleId: 'article-b' }),
        ],
        readingProgress: [
          progress({ articleId: 'article-b', position: 1, completed: true }),
        ],
        settings: frSettings,
      }),
    );

    applyBackup(replacement, 'replace');

    expect(readStudyData().readingSessions.map((item) => item.id)).toEqual([
      'reading-b',
    ]);
    expect(readStudyData().settings).toEqual(frSettings);
    expect(localStorage.getItem(`frp:${PREVIOUS_BACKUP_KEY}`)).not.toBeNull();
    expect(createBackup().data.readingSessions.map((item) => item.id)).toEqual([
      'reading-b',
    ]);

    restorePreviousBackup();

    expect(readStudyData().readingSessions.map((item) => item.id)).toEqual([
      'reading-a',
    ]);
    expect(readStudyData().settings).toEqual(zhSettings);
  });

  it('consumes the previous slot after restoring, so it cannot toggle A/B repeatedly', () => {
    seedSettings(zhSettings);
    saveReadingSession(readingSession());
    const replacement = makeBackup(
      makeData({
        readingSessions: [
          readingSession({ id: 'reading-b', articleId: 'article-b' }),
        ],
        settings: frSettings,
      }),
    );

    applyBackup(replacement, 'replace');
    expect(hasPreviousBackup()).toBe(true);

    restorePreviousBackup();

    expect(readStudyData().readingSessions.map((item) => item.id)).toEqual([
      'reading-a',
    ]);
    expect(readStudyData().settings).toEqual(zhSettings);
    expect(hasPreviousBackup()).toBe(false);
    expect(hasPreviousBackup()).toBe(false);

    expect(() => restorePreviousBackup()).toThrow();
    expect(readStudyData().readingSessions.map((item) => item.id)).toEqual([
      'reading-a',
    ]);

    saveReadingSession(
      readingSession({ id: 'reading-c', articleId: 'article-c' }),
    );
    expect(() => restorePreviousBackup()).toThrow();
    expect(readStudyData().readingSessions.map((item) => item.id)).toEqual([
      'reading-a',
      'reading-c',
    ]);
    expect(readStudyData().settings).toEqual(zhSettings);
  });

  it('keeps the previous backup and local data when a restore write fails', () => {
    seedSettings(zhSettings);
    saveReadingSession(readingSession());
    const replacement = makeBackup(
      makeData({
        readingSessions: [
          readingSession({ id: 'reading-b', articleId: 'article-b' }),
        ],
        settings: frSettings,
      }),
    );
    applyBackup(replacement, 'replace');
    expect(hasPreviousBackup()).toBe(true);

    const originalSetItem = Storage.prototype.setItem;
    let settingsWrites = 0;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === 'frp:settings' && settingsWrites === 0) {
        settingsWrites += 1;
        throw new Error('quota exceeded');
      }
      originalSetItem.call(this, key, value);
    });

    expect(() => restorePreviousBackup()).toThrow('quota exceeded');

    expect(readStudyData().readingSessions.map((item) => item.id)).toEqual([
      'reading-b',
    ]);
    expect(readStudyData().settings).toEqual(frSettings);
    expect(hasPreviousBackup()).toBe(true);

    vi.restoreAllMocks();
    restorePreviousBackup();

    expect(readStudyData().readingSessions.map((item) => item.id)).toEqual([
      'reading-a',
    ]);
    expect(readStudyData().settings).toEqual(zhSettings);
    expect(hasPreviousBackup()).toBe(false);
  });

  it('does not restore when no previous backup exists', () => {
    saveReadingSession(readingSession());
    localStorage.removeItem(`frp:${PREVIOUS_BACKUP_KEY}`);

    expect(() => restorePreviousBackup()).toThrow();

    expect(readStudyData().readingSessions).toHaveLength(1);
    expect(readStudyData().readingSessions[0].id).toBe('reading-a');
  });

  it('rolls back the replaced data when writing settings fails', () => {
    seedSettings(zhSettings);
    saveReadingSession(readingSession());
    const replacement = makeBackup(
      makeData({
        readingSessions: [
          readingSession({ id: 'reading-b', articleId: 'article-b' }),
        ],
        settings: frSettings,
      }),
    );
    const originalSetItem = Storage.prototype.setItem;
    let settingsWrites = 0;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === 'frp:settings' && settingsWrites === 0) {
        settingsWrites += 1;
        throw new Error('quota exceeded');
      }
      originalSetItem.call(this, key, value);
    });

    expect(() => applyBackup(replacement, 'replace')).toThrow('quota exceeded');

    const data = readStudyData();
    expect(data.readingSessions.map((item) => item.id)).toEqual(['reading-a']);
    expect(data.settings).toEqual(zhSettings);
  });

  it('throws and keeps the previous state when a merge cannot be written', () => {
    saveReadingSession(readingSession());
    const remote = makeBackup(
      makeData({
        readingSessions: [
          readingSession({ id: 'reading-b', articleId: 'article-b' }),
        ],
      }),
    );
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    expect(() => applyBackup(remote, 'merge')).toThrow('quota exceeded');

    vi.restoreAllMocks();
    expect(readStudyData().readingSessions.map((item) => item.id)).toEqual([
      'reading-a',
    ]);
  });

  it('rejects corrupt, future, malformed and oversized backups without writing', () => {
    seedSettings(zhSettings);
    saveReadingSession(readingSession());
    const valid = makeBackup(
      makeData({ readingSessions: [readingSession()], settings: frSettings }),
    );
    const originalData = localStorage.getItem('frp:study-data');
    const originalSettings = localStorage.getItem('frp:settings');
    const invalidBackups: unknown[] = [
      'not json',
      { ...valid, format: 'other-format' },
      { ...valid, version: 2 },
      { ...valid, exportedAt: 'yesterday' },
      {
        ...valid,
        data: {
          ...valid.data,
          readingSessions: [
            { ...readingSession(), startedAt: '2026-13-45T99:00:00.000Z' },
          ],
        },
      },
      {
        ...valid,
        data: {
          ...valid.data,
          readingSessions: [{ ...readingSession(), durationMs: -1 }],
        },
      },
      {
        ...valid,
        data: {
          ...valid.data,
          readingSessions: [{ ...readingSession(), id: '' }],
        },
      },
      {
        ...valid,
        data: {
          ...valid.data,
          readingProgress: [{ ...progress(), position: 1.2 }],
        },
      },
      {
        ...valid,
        data: {
          ...valid.data,
          practiceSessions: 'not-an-array',
        },
      },
      {
        ...valid,
        data: {
          ...valid.data,
          settings: { ...frSettings, uiLanguage: 'en' },
        },
      },
    ];

    for (const invalid of invalidBackups) {
      expect(() => parseBackup(invalid)).toThrow();
      expect(() => applyBackup(invalid as StudyBackup, 'replace')).toThrow();
      expect(localStorage.getItem('frp:study-data')).toBe(originalData);
      expect(localStorage.getItem('frp:settings')).toBe(originalSettings);
    }

    const oversized = `${JSON.stringify(valid)}${' '.repeat(MAX_BACKUP_BYTES)}`;
    expect(() => parseBackup(oversized)).toThrow(/limit|large|size|10/i);
    expect(localStorage.getItem('frp:study-data')).toBe(originalData);
    expect(localStorage.getItem('frp:settings')).toBe(originalSettings);
  });

  it('deduplicates repeated ids and keeps the latest progress inside one file', () => {
    const duplicate = makeBackup(
      makeData({
        readingSessions: [
          readingSession({ durationMs: 1_000 }),
          readingSession({ durationMs: 2_000 }),
        ],
        readingProgress: [
          progress({ position: 0.2, updatedAt: T1 }),
          progress({ position: 0.8, updatedAt: T2 }),
        ],
      }),
    );

    const parsed = parseBackup(duplicate);

    expect(parsed.data.readingSessions).toHaveLength(1);
    expect(parsed.data.readingProgress).toHaveLength(1);
    expect(parsed.data.readingProgress[0]).toMatchObject({
      position: 0.8,
      updatedAt: T2,
    });
  });

  it('summarizes the study data without advanced analytics', () => {
    const answers: PracticeAnswer[] = [
      { questionId: 'q1', selectedIndex: 1, correct: true },
      { questionId: 'q2', selectedIndex: null, correct: false },
    ];
    const summary = getStudySummary(
      makeData({
        readingSessions: [
          readingSession({ id: 'r1', articleId: 'article-a', durationMs: 1_000 }),
          readingSession({ id: 'r2', articleId: 'article-a', durationMs: 2_000 }),
          readingSession({ id: 'r3', articleId: 'article-b', durationMs: 500 }),
        ],
        practiceSessions: [
          practiceSession({
            id: 'p1',
            durationMs: 2_000,
            score: 1,
            total: 2,
            answers,
          }),
          practiceSession({
            id: 'p2',
            articleId: 'article-b',
            durationMs: 1_000,
            score: 0,
            total: 1,
            answers: [
              { questionId: 'q1', selectedIndex: 0, correct: false },
            ],
          }),
        ],
      }),
    );

    expect(summary).toEqual({
      readingMs: 3_500,
      practiceMs: 3_000,
      readingArticles: 2,
      practiceAttempts: 2,
      correctAnswers: 1,
      totalAnswers: 3,
    });
  });
});
