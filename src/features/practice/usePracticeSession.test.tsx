import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePracticeSession } from './usePracticeSession';
import { readStudyData } from '../data/backup';
import type { Article } from '../../types/content';

const article: Article = {
  id: 'article-a',
  title: 'Un article',
  level: 'A2',
  theme: 'culture',
  date: '2026-11-01',
  summary: 'Résumé.',
  paragraphs: [{ sentences: ['Une phrase.'] }],
  glossary: [],
  questions: [
    {
      id: 'q1',
      prompt: 'Question 1 ?',
      options: ['A', 'B', 'C', 'D'],
      answerIndex: 1,
      evidence: 'Une phrase.',
    },
    {
      id: 'q2',
      prompt: 'Question 2 ?',
      options: ['A', 'B', 'C', 'D'],
      answerIndex: 0,
      evidence: 'Une phrase.',
    },
  ],
  translations: {
    zh: {
      title: '一篇文章',
      summary: '摘要。',
      paragraphs: [{ sentences: ['一句话。'] }],
      glossary: {},
      questions: { q1: '解释 1', q2: '解释 2' },
    },
  },
  source: {
    site: 'Wikipédia en français',
    title: 'Article',
    authors: ['Auteur'],
    url: 'https://fr.wikipedia.org/wiki/Article',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    retrievedAt: '2026-11-01',
  },
  adaptation: {
    model: 'test',
    date: '2026-11-01',
    changes: 'Aucun.',
    reviewer: 'test',
  },
  license: {
    name: 'CC BY-SA 4.0',
    url: 'https://creativecommons.org/licenses/by-sa/4.0/',
  },
};

describe('usePracticeSession persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('persists the submitted attempt immediately with a stable id', () => {
    const { result, unmount } = renderHook(() => usePracticeSession(article));

    act(() => {
      result.current.answerQuestion('q1', 1);
      result.current.markWord('mot');
    });
    act(() => {
      result.current.submit(5_000);
    });

    const saved = readStudyData().practiceSessions;
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      articleId: article.id,
      durationMs: 5_000,
      score: 1,
      total: 2,
      markedWords: ['mot'],
    });
    expect(saved[0].id).toEqual(expect.any(String));

    unmount();

    const afterUnmount = readStudyData().practiceSessions;
    expect(afterUnmount).toHaveLength(1);
    expect(afterUnmount[0].id).toBe(saved[0].id);
  });

  it('throws and does not show a submitted result when persistence fails', () => {
    const { result } = renderHook(() => usePracticeSession(article));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    expect(() => {
      act(() => {
        result.current.submit(5_000);
      });
    }).toThrow('quota exceeded');

    expect(result.current.submitted).toBe(false);
    expect(readStudyData().practiceSessions).toHaveLength(0);
  });

  it('persists marked words added after submit with the same session id', () => {
    const { result } = renderHook(() => usePracticeSession(article));

    act(() => {
      result.current.markWord('avant');
    });
    act(() => {
      result.current.submit(5_000);
    });
    const submitted = readStudyData().practiceSessions;
    expect(submitted).toHaveLength(1);
    const sessionId = submitted[0].id;
    expect(submitted[0].markedWords).toEqual(['avant']);

    act(() => {
      result.current.markWord('après');
    });

    const updated = readStudyData().practiceSessions;
    expect(updated).toHaveLength(1);
    expect(updated[0].id).toBe(sessionId);
    expect(updated[0].markedWords).toEqual(['avant', 'après']);
    expect(updated[0]).toMatchObject({
      durationMs: 5_000,
      score: 0,
      total: 2,
    });
    expect(result.current.markedWords).toEqual(['avant', 'après']);

    act(() => {
      result.current.markWord('après');
    });
    expect(readStudyData().practiceSessions[0].markedWords).toEqual([
      'avant',
      'après',
    ]);
  });

  it('keeps the submitted snapshot unchanged when post-submit marking fails', () => {
    const { result } = renderHook(() => usePracticeSession(article));

    act(() => {
      result.current.markWord('avant');
    });
    act(() => {
      result.current.submit(5_000);
    });
    const before = readStudyData().practiceSessions;
    expect(before).toHaveLength(1);

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    expect(() => {
      act(() => {
        result.current.markWord('après');
      });
    }).toThrow('quota exceeded');

    expect(result.current.markedWords).toEqual(['avant']);
    expect(readStudyData().practiceSessions).toEqual(before);
  });

  it('writes nothing when the attempt was never submitted', () => {
    const { result, unmount } = renderHook(() => usePracticeSession(article));

    act(() => {
      result.current.answerQuestion('q1', 1);
    });
    unmount();

    expect(readStudyData().practiceSessions).toHaveLength(0);
  });
});
