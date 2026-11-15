import { useId } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface MarkedTermsProps {
  terms: string[];
  onRemove: (term: string) => void;
  extraAction?: (term: string) => ReactNode;
  footer?: ReactNode;
}

/**
 * Shared list of marked words for reading and practice. Chips are the only
 * removal action outside the text toolbar; removing never touches the
 * vocabulary list or a submitted practice record.
 */
export default function MarkedTerms({
  terms,
  onRemove,
  extraAction,
  footer,
}: MarkedTermsProps) {
  const { t } = useTranslation();
  const headingId = useId();

  if (terms.length === 0) return null;

  return (
    <section className="marked-terms" aria-labelledby={headingId}>
      <h2 id={headingId} className="marked-terms__label">
        {t('marks.markedWords')}
      </h2>
      <ul className="marked-terms__list">
        {terms.map((term) => (
          <li key={term} className="marked-terms__item">
            <span className="marked-terms__term" lang="fr">
              {term}
            </span>
            <button
              type="button"
              className="marked-terms__remove"
              onClick={() => onRemove(term)}
              aria-label={t('marks.removeAria', { term })}
            >
              <span aria-hidden="true">×</span>
            </button>
            {extraAction?.(term)}
          </li>
        ))}
      </ul>
      {footer}
    </section>
  );
}
