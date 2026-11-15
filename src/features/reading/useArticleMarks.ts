import { useCallback, useMemo } from 'react';
import { useStudyDataVersion } from '../../lib/studyDataEvents';
import {
  listArticleMarks,
  normalizeMarkedTerm,
  setArticleMark,
} from '../marks/articleMarks';

export interface ArticleMarksState {
  /** Active marks for the article, including compatible legacy sources. */
  terms: string[];
  isMarked: (term: string) => boolean;
  /** Writes a mark. Storage failures throw so the page can report them. */
  mark: (term: string) => void;
  /** Writes a removal. Storage failures throw so the page can report them. */
  unmark: (term: string) => void;
}

/**
 * Reads the shared article mark collection and refreshes it after any local
 * study-data change. Legacy draft or session terms can be supplied as seeds;
 * explicit article records, including removals, still take priority.
 */
export function useArticleMarks(
  articleId: string,
  seedTerms: readonly string[] = [],
): ArticleMarksState {
  const version = useStudyDataVersion();
  const seedKey = seedTerms.join('\u0000');

  const terms = useMemo(
    () =>
      listArticleMarks(
        articleId,
        seedTerms.length > 0 ? [...seedTerms] : undefined,
      ),
    // The version is the refresh signal; the seed key keeps equal seeds stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [articleId, version, seedKey, seedTerms.length],
  );

  const normalizedTerms = useMemo(
    () => new Set(terms.map((term) => normalizeMarkedTerm(term))),
    [terms],
  );

  const isMarked = useCallback(
    (term: string) => normalizedTerms.has(normalizeMarkedTerm(term)),
    [normalizedTerms],
  );

  const mark = useCallback(
    (term: string) => {
      setArticleMark(articleId, term, true);
    },
    [articleId],
  );

  const unmark = useCallback(
    (term: string) => {
      setArticleMark(articleId, term, false);
    },
    [articleId],
  );

  return { terms, isMarked, mark, unmark };
}
