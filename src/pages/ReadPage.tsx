import {
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { resolveArticleById } from '../lib/content';
import { lookupFrToZh } from '../lib/dictionary';
import { useReadingProgress } from '../features/reading/useReadingProgress';
import { useReadingSession } from '../features/reading/useReadingSession';
import ErrorState from '../components/ErrorState';
import GlossaryText from '../components/GlossaryText';
import LevelBadge from '../components/LevelBadge';
import LicenseBlock from '../components/LicenseBlock';
import SourceAttribution from '../components/SourceAttribution';
import type { Article } from '../types/content';
import '../styles/read.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string; missingId?: boolean }
  | { status: 'success'; article: Article };

type PanelState =
  | { kind: 'glossary'; term: string; explanation: string }
  | { kind: 'translation'; text: string }
  | null;

type TranslationStatus =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'success'; result: string };

export default function ReadPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  const load = useCallback(async () => {
    if (!id) {
      setState({ status: 'error', message: '', missingId: true });
      return;
    }
    setState({ status: 'loading' });
    try {
      const article = await resolveArticleById(id);
      setState({ status: 'success', article });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setState({ status: 'error', message });
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (state.status === 'loading') {
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

  return <ArticleReader key={state.article.id} article={state.article} />;
}

function ArticleReader({ article }: { article: Article }) {
  const { t } = useTranslation();
  const translation = article.translations.zh;
  const [showZh, setShowZh] = useState(false);
  const [panel, setPanel] = useState<PanelState>(null);
  const [selection, setSelection] = useState<string | null>(null);
  const [translationStatus, setTranslationStatus] = useState<TranslationStatus>({
    kind: 'idle',
  });
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const lastTermButtonRef = useRef<HTMLButtonElement | null>(null);
  const translationRequestRef = useRef(0);
  useReadingSession(article.id);
  useReadingProgress(article.id);

  useEffect(() => {
    const handleMouseUp = () => {
      const selected = window.getSelection()?.toString().trim() || '';
      setSelection(selected || null);
    };

    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && panel) {
        translationRequestRef.current += 1;
        setPanel(null);
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

  useEffect(() => {
    if (panel) {
      closeButtonRef.current?.focus();
      // Use a small delay to ensure the panel is in the layout before scrolling.
      const timer = window.setTimeout(() => {
        panelRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      }, 0);
      return () => window.clearTimeout(timer);
    }
    if (lastTermButtonRef.current) {
      lastTermButtonRef.current.focus();
      lastTermButtonRef.current = null;
    }
    return;
  }, [panel]);

  const handleLookup = (term: string, explanation: string) => {
    const active = document.activeElement;
    if (active instanceof HTMLButtonElement && active.classList.contains('gloss-term')) {
      lastTermButtonRef.current = active;
    }
    translationRequestRef.current += 1;
    setPanel({ kind: 'glossary', term, explanation });
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
    setPanel({ kind: 'translation', text: selection });
    await runTranslation(selection);
  };

  const handleLookupTranslation = () => {
    if (panel?.kind !== 'glossary') return;
    runTranslation(panel.term);
  };

  const closePanel = () => {
    translationRequestRef.current += 1;
    setPanel(null);
    setTranslationStatus({ kind: 'idle' });
  };

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

        <div className="article-body" data-testid="article-body">
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

        {selection && (
          <div className="selection-toolbar">
            <button
              type="button"
              className="selection-toolbar__button"
              onClick={handleTranslateSelection}
            >
              {t('read.translateSelection')}
            </button>
          </div>
        )}

        {panel && (
          <aside
            ref={panelRef}
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
                <h2 className="explanation-panel__term">{panel.term}</h2>
                <p className="explanation-panel__explanation">
                  {panel.explanation}
                </p>
                <button
                  type="button"
                  className="explanation-panel__action"
                  onClick={handleLookupTranslation}
                >
                  {t('read.translate')}
                </button>
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
                <p className="explanation-panel__result">
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
