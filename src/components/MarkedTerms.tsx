import { useId, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { normalizeMarkedTerm } from '../features/marks/articleMarks';
import {
  addVocabularyBatch,
  deleteVocabularyBatch,
  listVocabulary,
  type VocabularyEntry,
} from '../features/vocabulary/vocabulary';
import { findArticleSentenceContext } from '../lib/articleContext';
import {
  notifyStudyDataChanged,
  useStudyDataVersion,
} from '../lib/studyDataEvents';
import type { Article } from '../types/content';

interface MarkedTermsProps {
  terms: string[];
  onRemove: (term: string) => void;
  article?: Pick<Article, 'id' | 'title' | 'paragraphs'>;
  footer?: ReactNode;
}

/** Shares the mark list across reading and practice. An article enables notebook actions. */
export default function MarkedTerms({
  terms,
  onRemove,
  article,
  footer,
}: MarkedTermsProps) {
  const { t } = useTranslation();
  const headingId = useId();
  const version = useStudyDataVersion();
  const [vocabularyError, setVocabularyError] = useState<string | null>(null);
  const articleId = terms.length > 0 ? article?.id.trim() : undefined;
  const vocabularyByTerm = useMemo(() => {
    const byTerm = new Map<string, VocabularyEntry[]>();
    if (!articleId) return byTerm;

    for (const entry of listVocabulary({ includeDeleted: true })) {
      if (entry.articleId !== articleId) continue;
      const key = normalizeMarkedTerm(entry.term);
      const entries = byTerm.get(key);
      if (entries) entries.push(entry);
      else byTerm.set(key, [entry]);
    }
    return byTerm;
  }, [articleId, version]);

  if (terms.length === 0) return null;

  const words = terms.map((term) => {
    const entries = vocabularyByTerm.get(normalizeMarkedTerm(term)) ?? [];
    return {
      term,
      liveIds: entries
        .filter((entry) => entry.deletedAt === undefined)
        .map((entry) => entry.id),
      // A mark uses straight apostrophes. Reuse the saved spelling to revive
      // the same entry, including its translation, if it was removed.
      termToAdd: entries[0]?.term ?? term,
    };
  });
  const unsavedTerms = words
    .filter((word) => word.liveIds.length === 0)
    .map((word) => word.termToAdd);
  const hasSaved = unsavedTerms.length < words.length;
  const allSaved = unsavedTerms.length === 0;
  const handleAdd = (termsToAdd: string[], errorKey: string) => {
    if (!article || termsToAdd.length === 0) return;
    try {
      addVocabularyBatch(
        termsToAdd.map((term) => ({
          term,
          context: findArticleSentenceContext(article, term),
          articleId: article.id,
          articleTitle: article.title,
        })),
      );
    } catch {
      setVocabularyError(errorKey);
      return;
    }
    setVocabularyError(null);
    notifyStudyDataChanged();
  };

  const handleRemoveFromVocabulary = (ids: string[]) => {
    try {
      deleteVocabularyBatch(ids);
    } catch {
      setVocabularyError('vocabulary.deleteError');
      return;
    }
    setVocabularyError(null);
    notifyStudyDataChanged();
  };

  return (
    <section className="marked-terms" aria-labelledby={headingId}>
      <div className={article ? 'marked-terms__header' : undefined}>
        <h2 id={headingId} className="marked-terms__label">
          {t('marks.markedWords')}
        </h2>
        {article && (
          <button
            type="button"
            className="read-toolbar__toggle marked-terms__add-all"
            disabled={allSaved}
            onClick={() => handleAdd(unsavedTerms, 'marks.addAllVocabularyError')}
          >
            {t('marks.addAllToVocabulary')}
          </button>
        )}
      </div>
      <ul className="marked-terms__list">
        {words.map(({ term, liveIds, termToAdd }) => {
          const saved = liveIds.length > 0;
          const removeMarkLabel = t('marks.removeAria', { term });
          const vocabularyLabel = t(
            saved ? 'marks.removeTermFromVocabularyAria' : 'marks.addTermAria',
            { term },
          );
          return (
            <li key={term} className="marked-terms__item">
              <span className="marked-terms__term" lang="fr">
                {term}
              </span>
              <button
                type="button"
                className="marked-terms__remove"
                onClick={() => onRemove(term)}
                aria-label={removeMarkLabel}
                title={removeMarkLabel}
              >
                <span aria-hidden="true">×</span>
              </button>
              {article && (
                <button
                  type="button"
                  className={`marked-terms__vocabulary${saved ? ' marked-terms__vocabulary--saved' : ''}`}
                  onClick={() => {
                    if (saved) handleRemoveFromVocabulary(liveIds);
                    else handleAdd([termToAdd], 'read.addVocabularyError');
                  }}
                  aria-label={vocabularyLabel}
                  title={vocabularyLabel}
                >
                  <span aria-hidden="true">{saved ? '−' : '+'}</span>
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {article && hasSaved && (
        <p className="marked-terms__status" role={allSaved ? 'status' : undefined}>
          {allSaved && <>{t('marks.allInVocabulary')}{' '}</>}
          <Link to="/mots" className="marked-terms__link">
            {t('read.viewVocabulary')}
          </Link>
        </p>
      )}
      {article && vocabularyError && (
        <p className="marked-terms__error" role="alert">
          {t(vocabularyError)}
        </p>
      )}
      {footer}
    </section>
  );
}
