import type { Article } from '../../types/content';

/**
 * Shared practice fixture for focused tests. It is only imported by test files,
 * so it never reaches the production bundle.
 */
export const practiceArticle: Article = {
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
      options: ['A', 'B', 'C'],
      answerIndex: 0,
      evidence: 'Une phrase.',
    },
    {
      id: 'q3',
      prompt: 'Question 3 ?',
      options: ['A', 'B', 'C', 'D', 'E'],
      answerIndex: 4,
      evidence: 'Une phrase.',
    },
  ],
  translations: {
    zh: {
      title: '一篇文章',
      summary: '摘要。',
      paragraphs: [{ sentences: ['一句话。'] }],
      glossary: {},
      questions: { q1: '解释 1', q2: '解释 2', q3: '解释 3' },
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

/** Same article id and question ids, but the first question's options changed. */
export const stalePracticeArticle: Article = {
  ...practiceArticle,
  questions: practiceArticle.questions.map((question, index) =>
    index === 0 ? { ...question, options: ['A', 'B', 'C'] } : question,
  ),
};
