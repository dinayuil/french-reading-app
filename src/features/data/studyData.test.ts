import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PRACTICE_SESSIONS_KEY,
  READING_SESSIONS_KEY,
  STUDY_DATA_KEY,
  createRecordId,
  getReadingProgress,
  savePracticeSession,
  saveReadingProgress,
  saveReadingSession,
  writeStudyRecords,
} from './studyData';
import { readStudyData } from './backup';
import type { StudyData } from './backup';

const PREFIX = 'frp:';
const STUDY_KEY = `${PREFIX}${STUDY_DATA_KEY}`;
const READING_KEY = `${PREFIX}${READING_SESSIONS_KEY}`;
const PRACTICE_KEY = `${PREFIX}${PRACTICE_SESSIONS_KEY}`;

const T1 = '2026-11-01T10:00:00.000Z';
const T2 = '2026-11-02T10:00:00.000Z';

function emptyData(): StudyData {
  return {
    readingSessions: [],
    practiceSessions: [],
    readingProgress: [],
    settings: {
      uiLanguage: 'fr',
      onboardingSeen: false,
      practiceTimerVisible: true,
    },
  };
}

describe('study data storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('uses a single canonical document and keeps the legacy keys readable', () => {
    localStorage.setItem(
      READING_KEY,
      JSON.stringify([
        { articleId: 'a', startedAt: T1, durationMs: 1_000 },
      ]),
    );

    saveReadingSession({
      id: 'reading-new',
      articleId: 'b',
      startedAt: T2,
      durationMs: 2_000,
    });

    const raw = localStorage.getItem(STUDY_KEY);
    expect(raw).not.toBeNull();
    expect(localStorage.getItem(READING_KEY)).not.toBeNull();

    const data = readStudyData();
    expect(data.readingSessions.map((item) => item.articleId)).toEqual([
      'a',
      'b',
    ]);
  });

  it('falls back to legacy data when the canonical document is corrupt', () => {
    localStorage.setItem(STUDY_KEY, '{not json');
    localStorage.setItem(
      PRACTICE_KEY,
      JSON.stringify([
        {
          articleId: 'legacy',
          startedAt: T1,
          durationMs: 2_000,
          score: 1,
          total: 2,
          answers: [],
          markedWords: [],
        },
      ]),
    );

    const data = readStudyData();

    expect(data.practiceSessions).toHaveLength(1);
    expect(data.practiceSessions[0]).toMatchObject({
      articleId: 'legacy',
      durationMs: 2_000,
    });
    expect(data.practiceSessions[0].id).toEqual(expect.any(String));
  });

  it('does not resurrect legacy sessions after a replace rewrite', () => {
    localStorage.setItem(
      READING_KEY,
      JSON.stringify([
        { articleId: 'legacy', startedAt: T1, durationMs: 1_000 },
      ]),
    );

    writeStudyRecords({
      readingSessions: [
        {
          id: 'replacement',
          articleId: 'replacement',
          startedAt: T2,
          durationMs: 2_000,
        },
      ],
      practiceSessions: [],
      readingProgress: [],
    });

    const data = readStudyData();
    expect(data.readingSessions.map((item) => item.id)).toEqual([
      'replacement',
    ]);
  });

  it('uses the same deterministic id for migrated legacy records across reads', () => {
    const legacy = [
      { articleId: 'a', startedAt: T1, durationMs: 1_000 },
      { articleId: 'a', startedAt: T1, durationMs: 1_000 },
    ];
    localStorage.setItem(READING_KEY, JSON.stringify(legacy));

    const first = readStudyData();
    const second = readStudyData();

    expect(first.readingSessions).toHaveLength(2);
    expect(first.readingSessions.map((item) => item.id)).toEqual(
      second.readingSessions.map((item) => item.id),
    );
    expect(first.readingSessions[0].id).not.toBe(
      first.readingSessions[1].id,
    );
  });

  it('skips malformed legacy entries without dropping valid ones', () => {
    localStorage.setItem(
      READING_KEY,
      JSON.stringify([
        null,
        { articleId: 'valid', startedAt: T1, durationMs: 1_000 },
        { articleId: 42, startedAt: T1, durationMs: 1_000 },
      ]),
    );

    const data = readStudyData();

    expect(data.readingSessions).toHaveLength(1);
    expect(data.readingSessions[0].articleId).toBe('valid');
  });

  it('appends new records with unique generated ids', () => {
    saveReadingSession({
      id: createRecordId('reading'),
      articleId: 'a',
      startedAt: T1,
      durationMs: 1_000,
    });
    saveReadingSession({
      id: createRecordId('reading'),
      articleId: 'a',
      startedAt: T1,
      durationMs: 1_000,
    });

    const data = readStudyData();
    expect(data.readingSessions).toHaveLength(2);
    expect(data.readingSessions[0].id).not.toBe(data.readingSessions[1].id);
    expect(data.readingSessions[0].id).toMatch(/^reading-/);
  });

  it('throws on every learning record write when storage rejects it', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    expect(() =>
      saveReadingSession({
        id: 'reading-a',
        articleId: 'a',
        startedAt: T1,
        durationMs: 1_000,
      }),
    ).toThrow('quota exceeded');
    expect(() =>
      savePracticeSession({
        id: 'practice-a',
        articleId: 'a',
        startedAt: T1,
        durationMs: 1_000,
        score: 0,
        total: 1,
        answers: [],
        markedWords: [],
      }),
    ).toThrow('quota exceeded');
    expect(() =>
      saveReadingProgress({
        articleId: 'a',
        position: 0.5,
        completed: false,
        updatedAt: T2,
      }),
    ).toThrow('quota exceeded');
    expect(() => writeStudyRecords(emptyData())).toThrow('quota exceeded');
  });

  it('reads no progress for an article without a record', () => {
    expect(getReadingProgress('missing')).toBeNull();
  });
});
