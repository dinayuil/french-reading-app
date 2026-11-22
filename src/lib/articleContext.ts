import { normalizeMarkedTerm } from '../features/marks/articleMarks';
import type { Article } from '../types/content';

export function normalizeContextMatch(value: string): string {
  return normalizeMarkedTerm(value);
}

/**
 * Finds the first original French sentence containing the selected term or
 * marked word. Matching normalizes case, Unicode, whitespace and apostrophes.
 * The returned sentence keeps its original accents and punctuation.
 */
export function findArticleSentenceContext(
  article: Pick<Article, 'paragraphs'>,
  term: string,
): string | undefined {
  const needle = normalizeContextMatch(term);
  if (!needle) return undefined;

  for (const paragraph of article.paragraphs) {
    for (const sentence of paragraph.sentences) {
      if (normalizeContextMatch(sentence).includes(needle)) {
        return sentence;
      }
    }
  }

  return undefined;
}
