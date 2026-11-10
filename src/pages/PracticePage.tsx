import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { resolveArticleById } from '../lib/content';
import { lookupFrToZh } from '../lib/dictionary';
import { formatDuration, useVisibleDuration } from '../lib/time';
import { loadSettings, saveSettings } from '../lib/settings';
import ErrorState from '../components/ErrorState';
import GlossaryText from '../components/GlossaryText';
import LevelBadge from '../components/LevelBadge';
import LicenseBlock from '../components/LicenseBlock';
import { usePracticeSession } from '../features/practice/usePracticeSession';
import type { Article } from '../types/content';
import '../styles/read.css';
import '../styles/practice.css';

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

export default function PracticePage() {
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
        <p className="practice-page__loading" role="status">
          {t('practice.loading')}
        </p>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="container page">
        <ErrorState
          title={t('practice.loadErrorTitle')}
          message={t('practice.loadErrorMessage')}
          detail={state.missingId ? t('practice.missingId') : state.message}
          onRetry={load}
        />
      </div>
    );
  }

  return <PracticeRunner key={state.article.id} article={state.article} />;
}

function PracticeRunner({ article }: { article: Article }) {
  const { t } = useTranslation();
  const translation = article.translations.zh;
  const {
    answers,
    markedWords,
    submitted,
    score,
    total,
    results,
    frozenMs,
    answerQuestion,
    markWord,
    submit,
  } = usePracticeSession(article);
  const { elapsedMs, getElapsedMs } = useVisibleDuration(!submitted, 1_000, {
    pauseWhenHidden: false,
  });

  const [timerVisible, setTimerVisible] = useState(
    () => loadSettings().practiceTimerVisible,
  );
  const [showZh, setShowZh] = useState(false);
  const [selection, setSelection] = useState<string | null>(null);
  const [panel, setPanel] = useState<PanelState>(null);
  const [translationStatus, setTranslationStatus] = useState<TranslationStatus>({
    kind: 'idle',
  });
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const articleBodyRef = useRef<HTMLDivElement>(null);
  const selectionTimerRef = useRef<number | null>(null);
  const translationRequestRef = useRef(0);

  const readSelection = useCallback(() => {
    const currentSelection = window.getSelection();
    const text = currentSelection?.toString().trim() ?? '';
    const container = articleBodyRef.current;

    if (!text || !currentSelection || !container) {
      setSelection(null);
      return;
    }

    const insideArticle = (node: Node | null) =>
      node !== null && container.contains(node);

    if (
      insideArticle(currentSelection.anchorNode) &&
      insideArticle(currentSelection.focusNode)
    ) {
      setSelection(text);
    } else {
      setSelection(null);
    }
  }, []);

  useEffect(() => {
    const scheduleSelectionRead = () => {
      if (selectionTimerRef.current !== null) {
        window.clearTimeout(selectionTimerRef.current);
      }
      selectionTimerRef.current = window.setTimeout(() => {
        selectionTimerRef.current = null;
        readSelection();
      }, 150);
    };

    document.addEventListener('mouseup', readSelection);
    document.addEventListener('touchend', readSelection);
    document.addEventListener('selectionchange', scheduleSelectionRead);
    return () => {
      document.removeEventListener('mouseup', readSelection);
      document.removeEventListener('touchend', readSelection);
      document.removeEventListener('selectionchange', scheduleSelectionRead);
      if (selectionTimerRef.current !== null) {
        window.clearTimeout(selectionTimerRef.current);
      }
    };
  }, [readSelection]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && panel) {
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
    }
  }, [panel]);

  const toggleTimer = () => {
    const next = !timerVisible;
    setTimerVisible(next);
    saveSettings({ practiceTimerVisible: next });
  };

  const handleMark = () => {
    if (!selection) return;
    markWord(selection);
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  };

  const handleSubmit = () => {
    translationRequestRef.current += 1;
    submit(getElapsedMs());
    setSelection(null);
  };

  const handleLookup = (term: string, explanation: string) => {
    if (!submitted) return;
    translationRequestRef.current += 1;
    setPanel({ kind: 'glossary', term, explanation });
    setTranslationStatus({ kind: 'idle' });
  };

  const runTranslation = async (text: string) => {
    const requestId = ++translationRequestRef.current;
    setTranslationStatus({ kind: 'loading' });
    const result = await lookupFrToZh(text);
    if (translationRequestRef.current !== requestId) return;
    setTranslationStatus(
      result === null ? { kind: 'error' } : { kind: 'success', result },
    );
  };

  const handleTranslateSelection = async () => {
    if (!submitted || !selection) return;
    setPanel({ kind: 'translation', text: selection });
    await runTranslation(selection);
  };

  const closePanel = () => {
    translationRequestRef.current += 1;
    setPanel(null);
    setTranslationStatus({ kind: 'idle' });
  };

  return (
    <div className="practice-page">
      <header className="practice-header">
        <div className="container">
          <div className="practice-header__meta">
            <LevelBadge level={article.level} />
            <span className="read-header__theme">
              {t(`themes.${article.theme}`, article.theme)}
            </span>
            <span className="practice-header__kicker">
              {t('practice.kicker')}
            </span>
          </div>
          <h1 className="read-header__title" lang="fr">
            {article.title}
          </h1>
          {submitted && showZh && (
            <p className="read-header__title-zh" lang="zh-CN">
              {translation.title}
            </p>
          )}
          {submitted && (
            <p className="read-header__summary" lang="fr">
              {article.summary}
            </p>
          )}
          {submitted && showZh && (
            <p className="read-header__summary-zh" lang="zh-CN">
              {translation.summary}
            </p>
          )}

          <div className="practice-header__controls">
            {timerVisible && (
              <output
                className="practice-timer"
                data-testid="practice-timer"
                aria-label={t('practice.timerAria')}
              >
                {formatDuration(
                  submitted && frozenMs !== null ? frozenMs : elapsedMs,
                )}
              </output>
            )}
            <button
              type="button"
              className="read-toolbar__toggle"
              aria-pressed={!timerVisible}
              onClick={toggleTimer}
            >
              {timerVisible
                ? t('practice.hideTimer')
                : t('practice.showTimer')}
            </button>
            <Link
              to={`/read/${article.id}`}
              className="practice-header__back"
            >
              {t('practice.back')}
            </Link>
          </div>
        </div>
      </header>

      <div className="container practice-body">
        <p className="practice-intro">
          {t('practice.intro', { count: total })}{' '}
          <Link
            to="/aide"
            target="_blank"
            rel="noopener noreferrer"
            className="practice-intro__rules"
          >
            {t('practice.rulesLink')}
          </Link>
        </p>

        {submitted && (
          <section className="practice-result" aria-live="polite">
            <p className="practice-result__score">
              {t('practice.score', { score, total })}
            </p>
            <p className="practice-result__note">
              {t('practice.unlocked')}
            </p>
          </section>
        )}

        {submitted && (
          <div className="practice-toolbar">
            <button
              type="button"
              className={`read-toolbar__toggle${showZh ? ' read-toolbar__toggle--active' : ''}`}
              aria-pressed={showZh}
              onClick={() => setShowZh((value) => !value)}
            >
              {t('practice.showChinese')}
            </button>
          </div>
        )}

        <div
          ref={articleBodyRef}
          className="article-body"
          data-testid="article-body"
        >
          {submitted
            ? article.paragraphs.map((paragraph, paragraphIndex) => (
                <p key={paragraphIndex} className="article-paragraph">
                  {paragraph.sentences.map((sentence, sentenceIndex) => (
                    <span key={sentenceIndex} className="sentence-pair">
                      <span className="sentence-fr" lang="fr">
                        <GlossaryText
                          text={sentence}
                          glossary={article.glossary}
                          onLookup={(term) =>
                            handleLookup(term, translation.glossary[term])
                          }
                          ariaLabelForTerm={(term) =>
                            t('practice.termAria', {
                              term,
                              explanation: translation.glossary[term],
                            })
                          }
                        />
                      </span>
                      {showZh && (
                        <span className="sentence-zh" lang="zh-CN">
                          {
                            translation.paragraphs[paragraphIndex].sentences[
                              sentenceIndex
                            ]
                          }
                        </span>
                      )}
                    </span>
                  ))}
                </p>
              ))
            : article.paragraphs.map((paragraph, paragraphIndex) => (
                <p
                  key={paragraphIndex}
                  lang="fr"
                  className="article-paragraph practice-plain-text"
                >
                  {paragraph.sentences.join(' ')}
                </p>
              ))}
        </div>

        {markedWords.length > 0 && (
          <section
            className="practice-marks"
            aria-label={t('practice.markedWords')}
          >
            <h2 className="practice-marks__label">
              {t('practice.markedWords')}
            </h2>
            <ul className="practice-marks__list">
              {markedWords.map((word) => (
                <li key={word} className="practice-mark" lang="fr">
                  {word}
                </li>
              ))}
            </ul>
          </section>
        )}

        {selection && (
          <div
            className="selection-toolbar"
            role="toolbar"
            aria-label={t('practice.markAria')}
          >
            <button
              type="button"
              className="selection-toolbar__button"
              data-testid="mark-word"
              onClick={handleMark}
            >
              {t('practice.mark')}
            </button>
            {submitted && (
              <button
                type="button"
                className="selection-toolbar__button selection-toolbar__button--secondary"
                onClick={handleTranslateSelection}
              >
                {t('practice.translateSelection')}
              </button>
            )}
          </div>
        )}

        {submitted && panel && (
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
              aria-label={t('practice.close')}
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
                  onClick={() => runTranslation(panel.term)}
                >
                  {t('practice.translate')}
                </button>
              </>
            ) : (
              <h2 className="explanation-panel__term">{panel.text}</h2>
            )}
            <div className="explanation-panel__translation">
              {translationStatus.kind === 'loading' && (
                <p className="explanation-panel__loading">
                  {t('practice.translating')}
                </p>
              )}
              {translationStatus.kind === 'error' && (
                <p className="explanation-panel__error" role="alert">
                  {t('practice.translateError')}
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

        <section
          className="practice-questions"
          aria-labelledby="practice-questions-title"
        >
          <h2
            id="practice-questions-title"
            className="practice-section__title"
          >
            {t('practice.questions')}
          </h2>
          <ol className="practice-questions__list">
            {article.questions.map((question, questionIndex) => {
              const result = results.find(
                (item) => item.questionId === question.id,
              );
              const questionState = result
                ? result.correct
                  ? ' practice-question--correct'
                  : ' practice-question--incorrect'
                : '';

              return (
                <li key={question.id} className="practice-questions__item">
                  <fieldset
                    className={`practice-question${questionState}`}
                  >
                    <legend className="practice-question__prompt">
                      <span className="practice-question__number">
                        {t('practice.questionNumber', {
                          number: questionIndex + 1,
                        })}
                      </span>{' '}
                      {question.prompt}
                    </legend>
                    <div className="practice-question__options">
                      {question.options.map((option, optionIndex) => {
                        const selected =
                          answers[question.id] === optionIndex;
                        const isCorrectOption =
                          submitted &&
                          optionIndex === question.answerIndex;
                        const isWrongSelection =
                          submitted &&
                          selected &&
                          optionIndex !== question.answerIndex;
                        const optionClasses = [
                          'practice-option',
                          isCorrectOption
                            ? 'practice-option--correct'
                            : '',
                          isWrongSelection
                            ? 'practice-option--incorrect'
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' ');

                        return (
                          <label
                            key={optionIndex}
                            className={optionClasses}
                          >
                            <input
                              type="radio"
                              name={`question-${question.id}`}
                              value={optionIndex}
                              checked={selected}
                              disabled={submitted}
                              onChange={() =>
                                answerQuestion(question.id, optionIndex)
                              }
                            />
                            <span className="practice-option__text">
                              {option}
                            </span>
                          </label>
                        );
                      })}
                    </div>

                    {submitted && result && (
                      <div
                        className={`practice-feedback practice-feedback--${
                          result.correct ? 'correct' : 'incorrect'
                        }`}
                      >
                        <p className="practice-feedback__verdict">
                          {result.correct
                            ? t('practice.correct')
                            : t('practice.incorrect')}
                        </p>
                        {!result.correct && (
                          <p className="practice-feedback__your-answer">
                            {t('practice.yourAnswer')}{' '}
                            {result.selectedIndex === null
                              ? t('practice.notAnswered')
                              : question.options[result.selectedIndex]}
                          </p>
                        )}
                        <p className="practice-feedback__explanation">
                          {translation.questions[question.id]}
                        </p>
                        <p className="practice-feedback__evidence">
                          <span className="practice-feedback__evidence-label">
                            {t('practice.evidence')}
                          </span>
                          <q lang="fr">{question.evidence}</q>
                        </p>
                      </div>
                    )}
                  </fieldset>
                </li>
              );
            })}
          </ol>
        </section>

        {!submitted && (
          <div className="practice-submit">
            <button
              type="button"
              className="practice-submit__button"
              onClick={handleSubmit}
            >
              {t('practice.submit')}
            </button>
            <p className="practice-submit__hint">
              {t('practice.submitHint')}
            </p>
          </div>
        )}

        {submitted && (
          <div className="practice-actions">
            <Link to={`/read/${article.id}`} className="practice-actions__link">
              {t('practice.reread')}
            </Link>
          </div>
        )}

        <LicenseBlock article={article} />
      </div>
    </div>
  );
}
