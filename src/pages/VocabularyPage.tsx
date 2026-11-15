import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  deleteVocabulary,
  listVocabulary,
  updateVocabulary,
  type VocabularyEntry,
} from '../features/vocabulary/vocabulary';
import {
  notifyStudyDataChanged,
  useStudyDataVersion,
} from '../lib/studyDataEvents';
import '../styles/data.css';
import '../styles/vocabulary.css';

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase();
}

function entryMatches(entry: VocabularyEntry, query: string): boolean {
  if (!query) return true;
  const needle = normalizeSearch(query);
  return [entry.term, entry.translation, entry.context, entry.articleTitle].some(
    (value) => normalizeSearch(value ?? '').includes(needle),
  );
}

export default function VocabularyPage() {
  const { t, i18n } = useTranslation();
  const version = useStudyDataVersion();
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<
    { tone: 'success' | 'error'; text: string } | null
  >(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const entries = useMemo(() => {
    const all = listVocabulary();
    return all.slice().sort((left, right) => {
      const leftTime = Date.parse(left.updatedAt || left.createdAt);
      const rightTime = Date.parse(right.updatedAt || right.createdAt);
      return (Number.isNaN(rightTime) ? 0 : rightTime) -
        (Number.isNaN(leftTime) ? 0 : leftTime);
    });
    // The version is the refresh signal for local writes, imports and sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const filtered = useMemo(
    () => entries.filter((entry) => entryMatches(entry, query.trim())),
    [entries, query],
  );

  const locale = i18n.language.startsWith('zh') ? 'zh-CN' : 'fr-FR';
  const formatDate = (iso: string): string => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
  };

  const startEditing = (entry: VocabularyEntry) => {
    setConfirmingId(null);
    setNotice(null);
    setEditingId(entry.id);
    setDraft(entry.translation ?? '');
  };

  const cancelEditing = () => {
    setEditingId(null);
    setDraft('');
  };

  const saveTranslation = (event: FormEvent, entry: VocabularyEntry) => {
    event.preventDefault();
    setNotice(null);
    try {
      updateVocabulary(entry.id, { translation: draft.trim() });
    } catch {
      setNotice({ tone: 'error', text: t('vocabulary.saveError') });
      return;
    }
    setEditingId(null);
    setDraft('');
    notifyStudyDataChanged();
    setNotice({ tone: 'success', text: t('vocabulary.saved') });
  };

  const removeEntry = (entry: VocabularyEntry) => {
    setNotice(null);
    try {
      deleteVocabulary(entry.id);
    } catch {
      setNotice({ tone: 'error', text: t('vocabulary.deleteError') });
      return;
    }
    if (editingId === entry.id) cancelEditing();
    setConfirmingId(null);
    notifyStudyDataChanged();
    setNotice({ tone: 'success', text: t('vocabulary.deleted') });
  };

  const hasQuery = query.trim().length > 0;

  return (
    <div className="container page vocabulary-page">
      <header className="vocabulary-header">
        <div>
          <p className="vocabulary-header__kicker">{t('vocabulary.kicker')}</p>
          <h1 className="page__title vocabulary-header__title">
            {t('vocabulary.title')}
          </h1>
          <p className="vocabulary-header__intro">
            {t('vocabulary.intro')}
          </p>
        </div>
        <p className="vocabulary-header__count" aria-live="polite">
          {hasQuery
            ? t('vocabulary.filtered', { count: filtered.length })
            : t('vocabulary.count', { count: entries.length })}
        </p>
      </header>

      <div className="vocabulary-search">
        <label className="vocabulary-search__label" htmlFor="vocabulary-search">
          {t('vocabulary.searchLabel')}
        </label>
        <div className="vocabulary-search__field">
          <svg
            className="vocabulary-search__icon"
            viewBox="0 0 20 20"
            aria-hidden="true"
            focusable="false"
          >
            <circle cx="8.6" cy="8.6" r="5.4" />
            <path d="m12.7 12.7 4 4" />
          </svg>
          <input
            ref={searchRef}
            id="vocabulary-search"
            className="vocabulary-search__input"
            type="search"
            value={query}
            placeholder={t('vocabulary.searchPlaceholder')}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
          />
          {hasQuery && (
            <button
              type="button"
              className="vocabulary-search__clear"
              onClick={() => {
                setQuery('');
                searchRef.current?.focus();
              }}
            >
              {t('vocabulary.clearSearch')}
            </button>
          )}
        </div>
      </div>

      {notice && (
        <p
          className={`data-notice data-notice--${notice.tone}`}
          role={notice.tone === 'error' ? 'alert' : 'status'}
        >
          {notice.text}
        </p>
      )}

      {entries.length === 0 ? (
        <section className="vocabulary-empty" aria-labelledby="vocabulary-empty-title">
          <h2 id="vocabulary-empty-title" className="vocabulary-empty__title">
            {t('vocabulary.emptyTitle')}
          </h2>
          <p className="vocabulary-empty__body">{t('vocabulary.emptyBody')}</p>
          <Link to="/" className="data-button data-button--primary">
            {t('vocabulary.emptyCta')}
          </Link>
        </section>
      ) : filtered.length === 0 ? (
        <p className="vocabulary-no-results" role="status">
          {t('vocabulary.noResults')}
        </p>
      ) : (
        <ol className="vocabulary-list" aria-label={t('vocabulary.title')}>
          {filtered.map((entry) => {
            const editing = editingId === entry.id;
            const confirming = confirmingId === entry.id;
            const termId = `vocabulary-term-${entry.id}`;
            return (
              <li key={entry.id} className="vocabulary-entry">
                <article aria-labelledby={termId}>
                  <div className="vocabulary-entry__top">
                    <h2
                      id={termId}
                      className="vocabulary-entry__term"
                      lang="fr"
                    >
                      {entry.term}
                    </h2>
                    <button
                      type="button"
                      className="vocabulary-entry__edit"
                      onClick={() => startEditing(entry)}
                      aria-label={`${t('vocabulary.edit')} : ${entry.term}`}
                    >
                      {t('vocabulary.edit')}
                    </button>
                  </div>

                  {editing ? (
                    <form
                      className="vocabulary-entry__editor"
                      onSubmit={(event) => saveTranslation(event, entry)}
                    >
                      <label
                        className="vocabulary-entry__editor-label"
                        htmlFor={`vocabulary-translation-${entry.id}`}
                      >
                        {t('vocabulary.editLabel', { term: entry.term })}
                      </label>
                      <input
                        id={`vocabulary-translation-${entry.id}`}
                        className="vocabulary-entry__input"
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        autoFocus
                        maxLength={240}
                        lang={i18n.language.startsWith('zh') ? 'zh-CN' : undefined}
                      />
                      <div className="vocabulary-entry__editor-actions">
                        <button
                          type="submit"
                          className="data-button data-button--primary"
                        >
                          {t('vocabulary.save')}
                        </button>
                        <button
                          type="button"
                          className="data-button data-button--quiet"
                          onClick={cancelEditing}
                        >
                          {t('vocabulary.cancel')}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <p
                      className={`vocabulary-entry__translation${
                        entry.translation
                          ? ''
                          : ' vocabulary-entry__translation--empty'
                      }`}
                      lang={entry.translation ? 'zh-CN' : undefined}
                    >
                      {entry.translation || t('vocabulary.translationEmpty')}
                    </p>
                  )}

                  {entry.context && (
                    <blockquote className="vocabulary-entry__context" lang="fr">
                      {entry.context}
                    </blockquote>
                  )}

                  <div className="vocabulary-entry__footer">
                    <Link
                      to={`/read/${entry.articleId}`}
                      className="vocabulary-entry__source"
                    >
                      <span className="vocabulary-entry__source-label">
                        {t('vocabulary.source')}
                      </span>
                      <span lang="fr">{entry.articleTitle}</span>
                      <span className="vocabulary-entry__source-action">
                        {t('vocabulary.readSource')}
                      </span>
                    </Link>
                    <time
                      className="vocabulary-entry__date"
                      dateTime={entry.createdAt}
                    >
                      {t('vocabulary.addedOn', {
                        date: formatDate(entry.createdAt),
                      })}
                    </time>
                    <button
                      type="button"
                      className="vocabulary-entry__delete"
                      aria-expanded={confirming}
                      aria-controls={
                        confirming ? `vocabulary-delete-${entry.id}` : undefined
                      }
                      onClick={() => {
                        setEditingId(null);
                        setNotice(null);
                        setConfirmingId(confirming ? null : entry.id);
                      }}
                    >
                      {t('vocabulary.delete')}
                    </button>
                  </div>

                  {confirming && (
                    <div
                      id={`vocabulary-delete-${entry.id}`}
                      className="vocabulary-confirm"
                      role="group"
                      aria-label={t('vocabulary.deleteConfirm', {
                        term: entry.term,
                      })}
                    >
                      <p className="vocabulary-confirm__title">
                        {t('vocabulary.deleteConfirm', { term: entry.term })}
                      </p>
                      <p className="vocabulary-confirm__body">
                        {t('vocabulary.deleteBody')}
                      </p>
                      <div className="vocabulary-confirm__actions">
                        <button
                          type="button"
                          className="data-button data-button--danger"
                          onClick={() => removeEntry(entry)}
                          autoFocus
                        >
                          {t('vocabulary.deleteConfirmButton')}
                        </button>
                        <button
                          type="button"
                          className="data-button data-button--quiet"
                          onClick={() => setConfirmingId(null)}
                        >
                          {t('vocabulary.cancelDelete')}
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
