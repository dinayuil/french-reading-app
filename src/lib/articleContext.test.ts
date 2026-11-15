import { describe, expect, it } from 'vitest';
import {
  findArticleSentenceContext,
  normalizeContextMatch,
} from './articleContext';

const article = {
  paragraphs: [
    {
      sentences: [
        'La tour Eiffel est situé à Paris, au bord de la Seine.',
        'Elle mesure 330 mètres de hauteur.',
      ],
    },
    {
      sentences: ['Chaque année, des millions de touristes viennent la visiter.'],
    },
  ],
};

describe('findArticleSentenceContext', () => {
  it('returns the exact original sentence for a glossary term', () => {
    expect(findArticleSentenceContext(article, 'situé')).toBe(
      'La tour Eiffel est situé à Paris, au bord de la Seine.',
    );
  });

  it('matches without case, Unicode composition or extra whitespace', () => {
    expect(
      findArticleSentenceContext(article, '  TOUR   EIFFEL '),
    ).toBe('La tour Eiffel est situé à Paris, au bord de la Seine.');
    expect(
      findArticleSentenceContext(article, 'situ\u0065\u0301'),
    ).toBe('La tour Eiffel est situé à Paris, au bord de la Seine.');
  });

  it('keeps the original accents and punctuation in the returned text', () => {
    expect(findArticleSentenceContext(article, 'metres')).toBeUndefined();
    expect(findArticleSentenceContext(article, 'mètres')).toBe(
      'Elle mesure 330 mètres de hauteur.',
    );
  });

  it('returns undefined when no sentence contains the term', () => {
    expect(findArticleSentenceContext(article, 'nymphe')).toBeUndefined();
    expect(findArticleSentenceContext(article, '   ')).toBeUndefined();
  });

  it('normalizes whitespace for matching only', () => {
    expect(normalizeContextMatch('  La   tour\nEiffel  ')).toBe(
      'la tour eiffel',
    );
  });
});
