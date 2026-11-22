import {
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { resolveArticleFamilyById } from '../lib/content';
import { lookupFrToZh } from '../lib/dictionary';
import { findArticleSentenceContext } from '../lib/articleContext';
import { useReadingProgress } from '../features/reading/useReadingProgress';
import { useReadingSession } from '../features/reading/useReadingSession';
import { useArticleSelection } from '../features/reading/useArticleSelection';
import { useArticleMarks } from '../features/reading/useArticleMarks';
import { loadPracticeDraft } from '../features/practice/practiceDraft';
import {
  addVocabulary,
  updateVocabulary,
} from '../features/vocabulary/vocabulary';
import { notifyStudyDataChanged } from '../lib/studyDataEvents';
import ErrorState from '../components/ErrorState';
import GlossaryText from '../components/GlossaryText';
import LevelBadge from '../components/LevelBadge';
import LicenseBlock from '../components/LicenseBlock';
import MarkedTerms from '../components/MarkedTerms';
import SourceAttribution from '../components/SourceAttribution';
import ArticleImage from '../components/ArticleImage';
import type { Article, ArticleIndexEntry } from '../types/content';
import '../styles/read.css';

type LoadState =
  | { status: 'loading'; id: string | undefined }
  | {
      status: 'error';
      id: string | undefined;
      message: string;
      missingId?: boolean;
    }
  | {
      status: 'success';
      id: string;
      article: Article;
      versions: ArticleIndexEntry[];
    };

type PanelState =
  | { kind: 'glossary'; term: string; explanation: string }
  | { kind: 'translation'; text: string; context?: string }
  | null;

type TranslationStatus =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'success'; result: string };

type PanelNotice =
  | { tone: 'success' | 'error'; text: string }
  | null;

export default function ReadPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<LoadState>({ status: 'loading', id });
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    if (!id) {
      setState({ status: 'error', id, message: '', missingId: true });
      return;
    }
    setState({ status: 'loading', id });
    try {
      const resolved = await resolveArticleFamilyById(id);
      if (requestRef.current !== requestId) return;
      setState({ status: 'success', id, ...resolved });
    } catch (error) {
      if (requestRef.current !== requestId) return;
      const message = error instanceof Error ? error.message : '';
      setState({ status: 'error', id, message });
    }
  }, [id]);

  useEffect(() => {
    void load();
    return () => {
      requestRef.current += 1;
    };
  }, [load]);

  if (state.id !== id || state.status === 'loading') {
    return (
      <div className="container page">
        <p className="read-page__loading" role="status">
          {t('read.loading')}
        </p>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="container page">
        <ErrorState
          title={t('read.loadErrorTitle')}
          message={t('read.loadErrorMessage')}
          detail={state.missingId ? t('read.missingId') : state.message}
          onRetry={load}
        />
      </div>
    );
  }

  return (
    <ArticleReader
      key={state.article.id}
      article={state.article}
      versions={state.versions}
    />
  );
}

function ArticleReader({
  article,
  versions,
}: {
  article: Article;
  versions: ArticleIndexEntry[];
}) {
  const { t } = useTranslation();
  const translation = article.translations.zh;
  const [showZh, setShowZh] = useState(false);
  const [panel, setPanel] = useState<PanelState>(null);
  const [translationStatus, setTranslationStatus] = useState<TranslationStatus>({
    kind: 'idle',
  });
  const [addedTerm, setAddedTerm] = useState<string | null>(null);
  const [addError, setAddError] = useState(false);
  const [markError, setMarkError] = useState(false);
  const [panelNotice, setPanelNotice] = useState<PanelNotice>(null);
  const [draftMarkedWords] = useState<string[]>(() => {
    try {
      // Reading only reads a compatible unsent draft; it never starts or
      // creates a practice attempt. Explicit removals still win over this seed.
      return loadPracticeDraft(article)?.markedWords ?? [];
    } catch {
      return [];
    }
  });
  const articleBodyRef = useRef<HTMLDivElement>(null);
  const { selection, clearSelection, selectRange } =
    useArticleSelection(articleBodyRef);
  const {
    terms: markedTerms,
    isMarked,
    mark,
    unmark,
  } = useArticleMarks(article.id, draftMarkedWords);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const lastTermButtonRef = useRef<HTMLButtonElement | null>(null);
  const translationRequestRef = useRef(0);
  useReadingSession(article.id);
  useReadingProgress(article.id);

  useEffect(() => {
    if (!panel) return;
    closeButtonRef.current?.focus({ preventScroll: true });
    return () => {
      if (lastTermButtonRef.current) {
        lastTermButtonRef.current.focus({ preventScroll: true });
        lastTermButtonRef.current = null;
      }
    };
  }, [panel]);

  useEffect(() => {
    setAddedTerm(null);
    setAddError(false);
    setMarkError(false);
  }, [selection?.text]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && panel) {
        translationRequestRef.current += 1;
        setPanel(null);
        setPanelNotice(null);
        setTranslationStatus({ kind: 'idle' });
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [panel]);

  useEffect(() => {
    return () => {
      translationRequestRef.current += 1;
    };
  }, []);

  const handleLookup = (term: string, explanation: string) => {
    const active = document.activeElement;
    if (
      active instanceof HTMLButtonElement &&
      active.classList.contains('gloss-term')
    ) {
      lastTermButtonRef.current = active;
    }
    translationRequestRef.current += 1;
    setPanel({ kind: 'glossary', term, explanation });
    setPanelNotice(null);
    setTranslationStatus({ kind: 'idle' });
  };

  const runTranslation = async (text: string) => {
    const requestId = ++translationRequestRef.current;
    setTranslationStatus({ kind: 'loading' });
    const result = await lookupFrToZh(text);
    if (translationRequestRef.current !== requestId) return;
    if (result === null) {
      setTranslationStatus({ kind: 'error' });
    } else {
      setTranslationStatus({ kind: 'success', result });
    }
  };

  const handleTranslateSelection = async () => {
    if (!selection) return;
    setPanel({
      kind: 'translation',
      text: selection.text,
      context: selection.context,
    });
    setPanelNotice(null);
    await runTranslation(selection.text);
  };

  const storeWord = (
    term: string,
    context: string | undefined,
    translationText: string | undefined,
  ): boolean => {
    try {
      const entry = addVocabulary({
        term,
        translation: translationText,
        context,
        articleId: article.id,
        articleTitle: article.title,
      });
      if (translationText && entry.translation !== translationText) {
        updateVocabulary(entry.id, { translation: translationText });
      }
    } catch {
      return false;
    }
    notifyStudyDataChanged();
    return true;
  };

  const handleAddSelection = () => {
    if (!selection) return;
    setAddError(false);
    if (
      !storeWord(
        selection.text,
        selection.context ??
          findArticleSentenceContext(article, selection.text),
        undefined,
      )
    ) {
      setAddError(true);
      return;
    }
    setAddedTerm(selection.text);
  };

  const handleAddFromPanel = () => {
    if (!panel) return;
    const term = panel.kind === 'glossary' ? panel.term : panel.text;
    const context =
      panel.kind === 'translation'
        ? panel.context ?? findArticleSentenceContext(article, panel.text)
        : findArticleSentenceContext(article, panel.term);
    const translated =
      panel.kind === 'glossary'
        ? panel.explanation
        : translationStatus.kind === 'success'
          ? translationStatus.result
          : undefined;

    setPanelNotice(null);
    if (!storeWord(term, context, translated)) {
      setPanelNotice({ tone: 'error', text: t('read.addVocabularyError') });
      return;
    }
    setPanelNotice({ tone: 'success', text: t('read.addedToVocabulary') });
  };

  const closePanel = () => {
    translationRequestRef.current += 1;
    setPanel(null);
    setPanelNotice(null);
    setTranslationStatus({ kind: 'idle' });
  };

  const clearArticleSelection = () => {
    window.getSelection()?.removeAllRanges();
    clearSelection();
  };

  const handleSelectMarked = (term: string, range: Range) => {
    closePanel();
    selectRange(range, term);
  };

  const selectionIsMarked = selection ? isMarked(selection.text) : false;

  const handleToggleMark = () => {
    if (!selection) return;
    setMarkError(false);
    try {
      if (selectionIsMarked) {
        unmark(selection.text);
      } else {
        mark(selection.text);
      }
    } catch {
      setMarkError(true);
      return;
    }
    clearArticleSelection();
  };

  const handleRemoveMark = (term: string) => {
    setMarkError(false);
    try {
      unmark(term);
    } catch {
      setMarkError(true);
    }
  };

  const panelTerm = panel?.kind === 'glossary' ? panel.term : panel?.text;
  const panelAddLabel =
    panel?.kind === 'glossary'
      ? t('read.addGlossaryToVocabulary')
      : translationStatus.kind === 'success'
        ? t('read.addWithTranslation')
        : t('read.addToVocabulary');

  return (
    <article className="read-page">
      <header className="read-header">
        <div className="container">
          <div className="read-header__meta">
            <LevelBadge level={article.level} />
            <span className="read-header__theme">
              {t(`themes.${article.theme}`, article.theme)}
            </span>
          </div>
          {versions.length > 1 && (
            <nav
              className="read-version-switch"
              aria-label={t('read.versionNavigation')}
            >
              <span className="read-version-switch__label">
                {t('read.versions')}
              </span>
              <div className="read-version-switch__options">
                {versions.map((version) => {
                  const current = version.id === article.id;
                  return (
                    <Link
                      key={version.id}
                      to={`/read/${version.id}`}
                      className={`read-version-switch__option${current ? ' read-version-switch__option--current' : ''}`}
                      aria-current={current ? 'page' : undefined}
                      lang="fr"
                    >
                      {version.level}
                    </Link>
                  );
                })}
              </div>
            </nav>
          )}
          <h1 className="read-header__title" lang="fr">
            {article.title}
          </h1>
          {showZh && (
            <p className="read-header__title-zh" lang="zh-CN">
              {translation.title}
            </p>
          )}
          <p className="read-header__summary" lang="fr">
            {article.summary}
          </p>
          {showZh && (
            <p className="read-header__summary-zh" lang="zh-CN">
              {translation.summary}
            </p>
          )}
          <time className="read-header__date" dateTime={article.date}>
            {article.date}
          </time>
        </div>
      </header>

      <div className="container read-body">
        {article.source.attributionPosition === 'top' && (
          <SourceAttribution article={article} />
        )}

        <div className="read-toolbar">
          <button
            type="button"
            className={`read-toolbar__toggle${showZh ? ' read-toolbar__toggle--active' : ''}`}
            aria-pressed={showZh}
            onClick={() => setShowZh((v) => !v)}
          >
            {t('read.showChinese')}
          </button>
          <Link
            to={`/practice/${article.id}`}
            className="read-toolbar__practice"
          >
            {t('read.practiceCta')}
          </Link>
        </div>

        {article.image && <ArticleImage image={article.image} />}

        <div
          ref={articleBodyRef}
          className="article-body"
          data-testid="article-body"
        >
          {article.paragraphs.map((paragraph, pIndex) => (
            <p key={pIndex} className="article-paragraph">
              {paragraph.sentences.map((sentence, sIndex) => (
                <span key={sIndex} className="sentence-pair">
                  <span className="sentence-fr" lang="fr">
                    <GlossaryText
                      text={sentence}
                      glossary={article.glossary}
                      onLookup={(term) =>
                        handleLookup(term, translation.glossary[term])
                      }
                      ariaLabelForTerm={(term) =>
                        t('read.termAria', {
                          term,
                          explanation: translation.glossary[term],
                        })
                      }
                      markedTerms={markedTerms}
                      onSelectMarked={handleSelectMarked}
                    />
                  </span>
                  {showZh && (
                    <span className="sentence-zh" lang="zh-CN">
                      {translation.paragraphs[pIndex].sentences[sIndex]}
                    </span>
                  )}
                </span>
              ))}
            </p>
          ))}
        </div>

        <MarkedTerms
          terms={markedTerms}
          onRemove={handleRemoveMark}
          article={article}
          footer={
            markError && (!selection || panel) ? (
              <p className="marked-terms__error" role="alert">
                {t('marks.saveError')}
              </p>
            ) : null
          }
        />

        {selection && !panel && (
          <div
            className="selection-toolbar"
            role="toolbar"
            aria-label={t('marks.selectionActions')}
          >
            <div className="selection-toolbar__actions">
              <button
                type="button"
                className="selection-toolbar__button selection-toolbar__button--mark"
                data-testid={selectionIsMarked ? 'unmark-word' : 'mark-word'}
                onClick={handleToggleMark}
              >
                {selectionIsMarked ? t('marks.unmark') : t('marks.mark')}
              </button>
              <button
                type="button"
                className="selection-toolbar__button selection-toolbar__button--secondary"
                onClick={handleTranslateSelection}
              >
                {t('read.translateSelection')}
              </button>
              <button
                type="button"
                className="selection-toolbar__button selection-toolbar__button--secondary"
                onClick={handleAddSelection}
                disabled={addedTerm === selection.text}
              >
                {addedTerm === selection.text
                  ? t('read.added')
                  : t('read.addToVocabulary')}
              </button>
            </div>
            {markError && (
              <p className="selection-toolbar__error" role="alert">
                {t('marks.saveError')}
              </p>
            )}
            {addError && (
              <p className="selection-toolbar__error" role="alert">
                {t('read.addVocabularyError')}
              </p>
            )}
            {addedTerm === selection.text && (
              <p className="selection-toolbar__status" role="status">
                {t('read.addedToVocabulary')}{' '}
                <Link
                  to="/mots"
                  onClick={clearArticleSelection}
                  className="selection-toolbar__link"
                >
                  {t('read.viewVocabulary')}
                </Link>
              </p>
            )}
          </div>
        )}

        {panel && panelTerm && (
          <aside
            className="explanation-panel"
            role="dialog"
            aria-label={t('read.explanationTitle')}
            aria-live="polite"
          >
            <button
              ref={closeButtonRef}
              type="button"
              className="explanation-panel__close"
              onClick={closePanel}
              aria-label={t('read.close')}
            >
              ×
            </button>
            {panel.kind === 'glossary' ? (
              <>
                <h2 className="explanation-panel__term" lang="fr">
                  {panel.term}
                </h2>
                <p className="explanation-panel__explanation" lang="zh-CN">
                  {panel.explanation}
                </p>
              </>
            ) : (
              <>
                <p className="explanation-panel__label">
                  {t('read.selectedText')}
                </p>
                <h2 className="explanation-panel__term" lang="fr">
                  {panel.text}
                </h2>
              </>
            )}
            <div className="explanation-panel__actions">
              {panel.kind === 'glossary' && (
                <button
                  type="button"
                  className="explanation-panel__action"
                  onClick={() => runTranslation(panel.term)}
                >
                  {t('read.translate')}
                </button>
              )}
              <button
                type="button"
                className="explanation-panel__action explanation-panel__action--primary"
                onClick={handleAddFromPanel}
              >
                {panelAddLabel}
              </button>
            </div>
            {panelNotice && (
              <p
                className={`explanation-panel__notice explanation-panel__notice--${panelNotice.tone}`}
                role={panelNotice.tone === 'error' ? 'alert' : 'status'}
              >
                {panelNotice.text}
                {panelNotice.tone === 'success' && (
                  <>
                    {' '}
                    <Link
                      to="/mots"
                      onClick={clearArticleSelection}
                      className="explanation-panel__link"
                    >
                      {t('read.viewVocabulary')}
                    </Link>
                  </>
                )}
              </p>
            )}
            <div className="explanation-panel__translation">
              {translationStatus.kind === 'loading' && (
                <p className="explanation-panel__loading">
                  {t('read.translating')}
                </p>
              )}
              {translationStatus.kind === 'error' && (
                <p className="explanation-panel__error" role="alert">
                  {t('read.translateError')}
                </p>
              )}
              {translationStatus.kind === 'success' && (
                <p className="explanation-panel__result" lang="zh-CN">
                  {translationStatus.result}
                </p>
              )}
            </div>
          </aside>
        )}

        <LicenseBlock article={article} />
      </div>
    </article>
  );
}
