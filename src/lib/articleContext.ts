import type { Article } from '../types/content';

export function normalizeContextMatch(value: string): string {
  return value
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Finds the first original French sentence containing the selected term or
 * marked word. Matching is case-insensitive, Unicode-normalized and tolerant
 * of repeated whitespace, but the returned sentence keeps its original
 * accents and punctuation. Returns undefined when no sentence matches.
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
