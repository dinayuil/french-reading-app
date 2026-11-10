import { describe, expect, it } from 'vitest';
import { scorePractice } from './scoring';
import type { Article } from '../types/content';

const article: Article = {
  id: 'test-article',
  title: 'Test',
  level: 'B1',
  theme: 'test',
  date: '2026-11-09',
  summary: 'Résumé.',
  paragraphs: [{ sentences: ['Bonjour.'] }],
  glossary: [],
  questions: [
    {
      id: 'q1',
      prompt: 'Question 1 ?',
      options: ['a', 'b', 'c', 'd'],
      answerIndex: 1,
      evidence: 'Bonjour.',
    },
    {
      id: 'q2',
      prompt: 'Question 2 ?',
      options: ['a', 'b', 'c', 'd'],
      answerIndex: 0,
      evidence: 'Bonjour.',
    },
    {
      id: 'q3',
      prompt: 'Question 3 ?',
      options: ['a', 'b', 'c', 'd'],
      answerIndex: 2,
      evidence: 'Bonjour.',
    },
  ],
  translations: {
    zh: {
      title: '测试',
      summary: '摘要。',
      paragraphs: [{ sentences: ['你好。'] }],
      glossary: {},
      questions: {
        q1: '解析 1。',
        q2: '解析 2。',
        q3: '解析 3。',
      },
    },
  },
  source: {
    site: 'Source',
    title: 'Titre',
    authors: ['Auteur'],
    url: 'https://example.com',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    retrievedAt: '2026-11-09',
  },
  adaptation: {
    model: 'test',
    date: '2026-11-09',
    changes: 'Aucune.',
    reviewer: 'test',
  },
  license: {
    name: 'CC BY-SA 4.0',
    url: 'https://creativecommons.org/licenses/by-sa/4.0/',
  },
};

describe('scorePractice', () => {
  it('gives a full score when every answer is correct', () => {
    const { score, total, results } = scorePractice(
      article,
      { q1: 1, q2: 0, q3: 2 },
      [],
    );

    expect(score).toBe(3);
    expect(total).toBe(3);
    expect(results).toHaveLength(3);
    expect(results.every((result) => result.correct)).toBe(true);
    expect(results.map((result) => result.selectedIndex)).toEqual([1, 0, 2]);
  });

  it('counts a null answer as wrong', () => {
    const { score, results } = scorePractice(
      article,
      { q1: 1, q2: null, q3: 2 },
      [],
    );

    expect(score).toBe(2);
    expect(results[1]).toEqual({
      questionId: 'q2',
      selectedIndex: null,
      correct: false,
    });
  });

  it('counts an incorrect selection as wrong', () => {
    const { score, results } = scorePractice(
      article,
      { q1: 1, q2: 1, q3: 2 },
      [],
    );

    expect(score).toBe(2);
    expect(results[1]).toEqual({
      questionId: 'q2',
      selectedIndex: 1,
      correct: false,
    });
  });

  it('treats a missing answer as unanswered and wrong', () => {
    const { score, results } = scorePractice(article, { q1: 1 }, []);

    expect(score).toBe(1);
    expect(results[1].selectedIndex).toBeNull();
    expect(results[1].correct).toBe(false);
  });

  it('returns results in article question order regardless of answer key order', () => {
    const { results } = scorePractice(
      article,
      { q3: 2, q1: 1, q2: 0 },
      [],
    );

    expect(results.map((result) => result.questionId)).toEqual([
      'q1',
      'q2',
      'q3',
    ]);
  });

  it('sets total to the number of article questions', () => {
    const { total } = scorePractice(article, {}, []);

    expect(total).toBe(article.questions.length);
  });
});
