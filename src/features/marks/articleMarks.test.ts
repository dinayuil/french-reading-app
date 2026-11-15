import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createArticleMarkId,
  listArticleMarks,
  normalizeMarkedTerm,
  setArticleMark,
} from './articleMarks';
import {
  PRACTICE_SESSIONS_KEY,
  STUDY_DATA_KEY,
  readStudyRecords,
  writeStudyRecords,
} from '../data/studyData';
import type { VocabularyEntry } from '../../types/progress';

const PREFIX = 'frp:';
const STUDY_KEY = `${PREFIX}${STUDY_DATA_KEY}`;
const PRACTICE_KEY = `${PREFIX}${PRACTICE_SESSIONS_KEY}`;

const T1 = '2026-11-01T10:00:00.000Z';

function practice(articleId: string, markedWords: string[]) {
  return {
    articleId,
    startedAt: T1,
    durationMs: 2_000,
    score: 1,
    total: 1,
    answers: [{ questionId: 'q', selectedIndex: 0, correct: true }],
    markedWords,
  };
}

const vocabulary: VocabularyEntry = {
  id: 'vocab-a',
  term: 'mot',
  translation: 'word',
  context: 'Un mot.',
  articleId: 'article-a',
  articleTitle: 'Article A',
  createdAt: T1,
  updatedAt: T1,
};

describe('article marks', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('adds, removes and readds one mark with monotonic timestamps', () => {
    setArticleMark('article-a', 'Bonjour', true);

    let marks = readStudyRecords().articleMarks ?? [];
    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({
      articleId: 'article-a',
      term: 'Bonjour',
    });
    expect(marks[0].deletedAt).toBeUndefined();
    expect(Date.parse(marks[0].updatedAt)).not.toBeNaN();
    const addedAt = marks[0].updatedAt;

    setArticleMark('article-a', ' bonjour ', false);

    marks = readStudyRecords().articleMarks ?? [];
    expect(marks).toHaveLength(1);
    expect(marks[0].deletedAt).toBe(marks[0].updatedAt);
    expect(Date.parse(marks[0].updatedAt)).toBeGreaterThan(
      Date.parse(addedAt),
    );
    const removedAt = marks[0].updatedAt;
    expect(listArticleMarks('article-a')).toEqual([]);

    setArticleMark('article-a', 'BONJOUR', true);

    marks = readStudyRecords().articleMarks ?? [];
    expect(marks).toHaveLength(1);
    expect(marks[0].term).toBe('BONJOUR');
    expect(marks[0].deletedAt).toBeUndefined();
    expect(Date.parse(marks[0].updatedAt)).toBeGreaterThan(
      Date.parse(removedAt),
    );
    expect(listArticleMarks('article-a')).toEqual(['BONJOUR']);
  });

  it('keeps marks per article and uses one collision-free normalized identity', () => {
    setArticleMark('article-a', 'Bonjour', true);
    setArticleMark('article-a', 'bonjour', true);
    setArticleMark('article-a', 'BONJOUR', true);
    setArticleMark('article-b', 'bonjour', true);

    const marks = readStudyRecords().articleMarks ?? [];
    expect(marks).toHaveLength(2);
    expect(marks.filter((mark) => mark.articleId === 'article-a')).toHaveLength(
      1,
    );
    expect(listArticleMarks('article-a')).toEqual(['Bonjour']);
    expect(listArticleMarks('article-b')).toEqual(['bonjour']);
    expect(
      marks.find((mark) => mark.articleId === 'article-a')?.id,
    ).toBe(createArticleMarkId('article-a', 'bonjour'));

    expect(createArticleMarkId('article-a', 'x:y')).not.toBe(
      createArticleMarkId('article-a:x', 'y'),
    );
    expect(createArticleMarkId('a:b', 'c')).not.toBe(
      createArticleMarkId('a', 'b:c'),
    );

    setArticleMark('article-c', 'Été', true);
    setArticleMark('article-c', 'e\u0301te\u0301', true);
    expect(
      readStudyRecords().articleMarks?.filter(
        (mark) => mark.articleId === 'article-c',
      ),
    ).toHaveLength(1);
    expect(listArticleMarks('article-c')).toEqual(['Été']);
  });

  it('falls back to legacy practice marks and supplied draft seeds until an explicit record exists', () => {
    localStorage.setItem(
      PRACTICE_KEY,
      JSON.stringify([
        practice('article-a', ['ancien', 'mot']),
        practice('article-b', ['autre']),
      ]),
    );

    expect(listArticleMarks('article-a')).toEqual(['ancien', 'mot']);
    expect(listArticleMarks('article-a', ['brouillon', 'ancien'])).toEqual([
      'ancien',
      'mot',
      'brouillon',
    ]);
    expect(listArticleMarks('article-b')).toEqual(['autre']);

    setArticleMark('article-a', 'mot', true);
    expect(listArticleMarks('article-a', ['brouillon'])).toEqual([
      'mot',
      'ancien',
      'brouillon',
    ]);

    setArticleMark('article-a', 'mot', false);
    expect(listArticleMarks('article-a', ['mot'])).toEqual(['ancien']);

    setArticleMark('article-a', 'mot', true);
    expect(listArticleMarks('article-a', ['mot'])).toEqual(['mot', 'ancien']);
  });

  it('records a removal without rewriting practice history or vocabulary', () => {
    const session = {
      id: 'practice-a',
      ...practice('article-a', ['mot', 'ancien']),
    };
    writeStudyRecords({
      readingSessions: [
        {
          id: 'reading-a',
          articleId: 'article-a',
          startedAt: T1,
          durationMs: 1_000,
        },
      ],
      practiceSessions: [session],
      readingProgress: [
        {
          articleId: 'article-a',
          position: 0.5,
          completed: false,
          updatedAt: T1,
        },
      ],
      vocabulary: [vocabulary],
      articleMarks: [],
    });

    setArticleMark('article-a', 'mot', false);

    const records = readStudyRecords();
    expect(records.practiceSessions).toEqual([session]);
    expect(records.vocabulary).toEqual([vocabulary]);
    expect(records.readingSessions).toHaveLength(1);
    expect(records.readingProgress).toHaveLength(1);
    expect(records.articleMarks).toHaveLength(1);
    expect(records.articleMarks?.[0]).toMatchObject({
      articleId: 'article-a',
      term: 'mot',
    });
    expect(records.articleMarks?.[0].deletedAt).toEqual(expect.any(String));
    expect(listArticleMarks('article-a')).toEqual(['ancien']);
  });

  it('notifies once after a committed write and leaves storage untouched on failure', () => {
    const listener = vi.fn();
    window.addEventListener('frp:study-data-changed', listener);

    setArticleMark('article-a', 'mot', true);
    expect(listener).toHaveBeenCalledTimes(1);

    const raw = localStorage.getItem(STUDY_KEY);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    expect(() => setArticleMark('article-a', 'autre', true)).toThrow(
      'quota exceeded',
    );
    expect(localStorage.getItem(STUDY_KEY)).toBe(raw);
    expect(listArticleMarks('article-a')).toEqual(['mot']);
    expect(listener).toHaveBeenCalledTimes(1);

    vi.restoreAllMocks();
    setArticleMark('article-a', 'autre', true);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listArticleMarks('article-a')).toEqual(['autre', 'mot']);

    window.removeEventListener('frp:study-data-changed', listener);
  });

  it('rejects invalid input before writing', () => {
    const raw = localStorage.getItem(STUDY_KEY);

    expect(() => setArticleMark('   ', 'mot', true)).toThrow();
    expect(() => setArticleMark('article-a', '   ', true)).toThrow();
    expect(() =>
      setArticleMark('article-a', 'mot', 'yes' as unknown as boolean),
    ).toThrow();
    expect(localStorage.getItem(STUDY_KEY)).toBe(raw);
  });

  it('normalizes mark identity case, Unicode and apostrophes', () => {
    expect(normalizeMarkedTerm('  L’HOMME \n')).toBe("l'homme");
    expect(normalizeMarkedTerm('E\u0301TE\u0301')).toBe(
      normalizeMarkedTerm('été'),
    );
  });
});
