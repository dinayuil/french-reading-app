import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { resolveArticleById } from '../lib/content';
import { lookupFrToZh } from '../lib/dictionary';
import { findArticleSentenceContext } from '../lib/articleContext';
import { formatDuration, useVisibleDuration } from '../lib/time';
import { loadSettings, saveSettings } from '../lib/settings';
import { notifyStudyDataChanged } from '../lib/studyDataEvents';
import {
  addVocabulary,
  updateVocabulary,
} from '../features/vocabulary/vocabulary';
import { useArticleSelection } from '../features/reading/useArticleSelection';
import { useArticleMarks } from '../features/reading/useArticleMarks';
import ErrorState from '../components/ErrorState';
import GlossaryText from '../components/GlossaryText';
import LevelBadge from '../components/LevelBadge';
import LicenseBlock from '../components/LicenseBlock';
import MarkedTerms from '../components/MarkedTerms';
import SourceAttribution from '../components/SourceAttribution';
import ArticleImage from '../components/ArticleImage';
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

export default function PracticePage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

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

  return (
    <PracticeRunner
      key={`${state.article.id}-${attempt}`}
      article={state.article}
      onRetry={() => {
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        setAttempt((value) => value + 1);
      }}
    />
  );
}

function PracticeRunner({
  article,
  onRetry,
}: {
  article: Article;
  onRetry: () => void;
}) {
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
    questionOrder,
    optionOrders,
    initialElapsedMs,
    answerQuestion,
    checkpointElapsed,
    submit,
  } = usePracticeSession(article);
  const { elapsedMs, getElapsedMs } = useVisibleDuration(!submitted, 1_000, {
    pauseWhenHidden: false,
    initialElapsedMs,
  });

  const [timerVisible, setTimerVisible] = useState(
    () => loadSettings().practiceTimerVisible,
  );
  const [showZh, setShowZh] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [markError, setMarkError] = useState(false);
  const [answerError, setAnswerError] = useState(false);
  const [panel, setPanel] = useState<PanelState>(null);
  const [translationStatus, setTranslationStatus] = useState<TranslationStatus>({
    kind: 'idle',
  });
  const [addedTerm, setAddedTerm] = useState<string | null>(null);
  const [addError, setAddError] = useState(false);
  const [panelNotice, setPanelNotice] = useState<PanelNotice>(null);
  const articleBodyRef = useRef<HTMLDivElement>(null);
  const { selection, clearSelection, selectRange } =
    useArticleSelection(articleBodyRef);
  const {
    terms: markedTerms,
    isMarked,
    mark,
    unmark,
  } = useArticleMarks(article.id, markedWords);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const lastTermButtonRef = useRef<HTMLButtonElement | null>(null);
  const translationRequestRef = useRef(0);

  useEffect(() => {
    const flush = () => checkpointElapsed(getElapsedMs());
    if (submitted) return;

    const intervalId = window.setInterval(flush, 5_000);
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    const handlePageHide = () => flush();

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', handlePageHide);
      flush();
    };
  }, [submitted, checkpointElapsed, getElapsedMs]);

  useEffect(() => {
    setAddedTerm(null);
    setAddError(false);
    setMarkError(false);
  }, [selection?.text]);

  useEffect(() => {
    if (panel) {
      closeButtonRef.current?.focus({ preventScroll: true });
      return;
    }
    if (lastTermButtonRef.current) {
      lastTermButtonRef.current.focus({ preventScroll: true });
      lastTermButtonRef.current = null;
    }
  }, [panel]);

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

  const toggleTimer = () => {
    const next = !timerVisible;
    setTimerVisible(next);
    saveSettings({ practiceTimerVisible: next });
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

  const handleSubmit = () => {
    setSubmitError(false);
    setAnswerError(false);
    try {
      submit(getElapsedMs());
    } catch {
      setSubmitError(true);
      return;
    }

    notifyStudyDataChanged();
    translationRequestRef.current += 1;
    window.getSelection()?.removeAllRanges();
    clearSelection();
    setMarkError(false);
    setPanel(null);
    setPanelNotice(null);
    setTranslationStatus({ kind: 'idle' });
  };

  const handleLookup = (term: string, explanation: string) => {
    if (!submitted) return;
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
    setTranslationStatus(
      result === null ? { kind: 'error' } : { kind: 'success', result },
    );
  };

  const handleTranslateSelection = async () => {
    if (!submitted || !selection) return;
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
    if (!submitted || !selection) return;
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
    if (!submitted || !panel) return;
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
      setPanelNotice({ tone: 'error', text: t('practice.addVocabularyError') });
      return;
    }
    setPanelNotice({ tone: 'success', text: t('practice.addedToVocabulary') });
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

  const orderedQuestions = questionOrder.length
    ? questionOrder.flatMap((questionId) => {
        const question = article.questions.find(
          (candidate) => candidate.id === questionId,
        );
        return question ? [question] : [];
      })
    : article.questions;

  const panelTerm = panel?.kind === 'glossary' ? panel.term : panel?.text;
  const panelAddLabel =
    panel?.kind === 'glossary'
      ? t('practice.addToVocabulary')
      : translationStatus.kind === 'success'
        ? t('practice.addWithTranslation')
        : t('practice.addToVocabulary');

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
            {(timerVisible || submitted) && (
              <span
                className={`practice-timer${
                  submitted ? ' practice-timer--frozen' : ''
                }`}
                data-testid="practice-timer"
                role="timer"
                aria-label={
                  submitted
                    ? t('practice.finalTimerAria')
                    : t('practice.timerAria')
                }
              >
                {formatDuration(
                  submitted && frozenMs !== null ? frozenMs : elapsedMs,
                )}
              </span>
            )}
            {!submitted && (
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
            )}
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

        {!submitted && initialElapsedMs > 0 && (
          <p className="practice-resume" role="status">
            {t('practice.resumed')}
          </p>
        )}

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

        {article.source.attributionPosition === 'top' && (
          <SourceAttribution article={article} />
        )}

        {submitted && article.image && <ArticleImage image={article.image} />}

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
                          markedTerms={markedTerms}
                          onSelectMarked={handleSelectMarked}
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
                  {paragraph.sentences.map((sentence, sentenceIndex) => (
                    <Fragment key={sentenceIndex}>
                      {sentenceIndex > 0 && ' '}
                      <GlossaryText
                        text={sentence}
                        glossary={article.glossary}
                        onLookup={(term) =>
                          handleLookup(term, translation.glossary[term])
                        }
                        enabled={false}
                        markedTerms={markedTerms}
                        onSelectMarked={handleSelectMarked}
                      />
                    </Fragment>
                  ))}
                </p>
              ))}
        </div>

        <MarkedTerms
          terms={markedTerms}
          onRemove={handleRemoveMark}
          article={submitted ? article : undefined}
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
              {submitted && (
                <button
                  type="button"
                  className="selection-toolbar__button selection-toolbar__button--secondary"
                  onClick={handleTranslateSelection}
                >
                  {t('practice.translateSelection')}
                </button>
              )}
              {submitted && (
                <button
                  type="button"
                  className="selection-toolbar__button selection-toolbar__button--secondary"
                  onClick={handleAddSelection}
                  disabled={addedTerm === selection.text}
                >
                  {addedTerm === selection.text
                    ? t('practice.added')
                    : t('practice.addToVocabulary')}
                </button>
              )}
            </div>
            {markError && (
              <p className="selection-toolbar__error" role="alert">
                {t('marks.saveError')}
              </p>
            )}
            {submitted && addError && (
              <p className="selection-toolbar__error" role="alert">
                {t('practice.addVocabularyError')}
              </p>
            )}
            {submitted && addedTerm === selection.text && (
              <p className="selection-toolbar__status" role="status">
                {t('practice.addedToVocabulary')}{' '}
                <Link
                  to="/mots"
                  onClick={clearArticleSelection}
                  className="selection-toolbar__link"
                >
                  {t('practice.viewVocabulary')}
                </Link>
              </p>
            )}
          </div>
        )}

        {submitted && panel && panelTerm && (
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
                  {t('practice.translate')}
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
                    <Link to="/mots" className="explanation-panel__link">
                      {t('practice.viewVocabulary')}
                    </Link>
                  </>
                )}
              </p>
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
                <p className="explanation-panel__result" lang="zh-CN">
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
          {answerError && (
            <p className="practice-save-error" role="alert">
              {t('practice.saveErrorAnswer')}
            </p>
          )}
          <ol className="practice-questions__list">
            {orderedQuestions.map((question, questionIndex) => {
              const result = results.find(
                (item) => item.questionId === question.id,
              );
              const questionState = result
                ? result.correct
                  ? ' practice-question--correct'
                  : ' practice-question--incorrect'
                : '';
              const translatedQuestion = showZh
                ? translation.questionTexts?.[question.id]
                : undefined;
              const displayedExplanation = showZh
                ? translation.questions[question.id]
                : question.explanation;
              const optionOrder =
                optionOrders[question.id] ??
                question.options.map((_, index) => index);

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
                      <span
                        className="practice-question__text"
                        lang="fr"
                      >
                        {question.prompt}
                      </span>
                      {translatedQuestion && (
                        <span
                          className="practice-question__text-zh"
                          lang="zh-CN"
                        >
                          {translatedQuestion.prompt}
                        </span>
                      )}
                    </legend>
                    <div className="practice-question__options">
                      {optionOrder.map((optionIndex) => {
                        const option = question.options[optionIndex];
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
                        const translatedOption =
                          translatedQuestion?.options[optionIndex];

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
                              onChange={() => {
                                setAnswerError(false);
                                try {
                                  answerQuestion(question.id, optionIndex);
                                } catch {
                                  setAnswerError(true);
                                }
                              }}
                            />
                            <span className="practice-option__text">
                              <span
                                className="practice-option__text-fr"
                                lang="fr"
                              >
                                {option}
                              </span>
                              {translatedOption && (
                                <span
                                  className="practice-option__text-zh"
                                  lang="zh-CN"
                                >
                                  {translatedOption}
                                </span>
                              )}
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
                            {result.selectedIndex === null ? (
                              t('practice.notAnswered')
                            ) : (
                              <>
                                <span lang="fr">
                                  {question.options[result.selectedIndex]}
                                </span>
                                {translatedQuestion && (
                                  <span
                                    className="practice-feedback__your-answer-zh"
                                    lang="zh-CN"
                                  >
                                    {
                                      translatedQuestion.options[
                                        result.selectedIndex
                                      ]
                                    }
                                  </span>
                                )}
                              </>
                            )}
                          </p>
                        )}
                        {displayedExplanation && (
                          <p
                            className="practice-feedback__explanation"
                            lang={showZh ? 'zh-CN' : 'fr'}
                          >
                            {displayedExplanation}
                          </p>
                        )}
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
            {submitError && (
              <p className="practice-save-error" role="alert">
                {t('practice.saveErrorSubmit')}
              </p>
            )}
          </div>
        )}

        {submitted && (
          <div className="practice-actions">
            <Link to={`/read/${article.id}`} className="practice-actions__link">
              {t('practice.reread')}
            </Link>
            <button
              type="button"
              className="practice-actions__link practice-actions__retry"
              onClick={onRetry}
            >
              {t('practice.retry')}
            </button>
          </div>
        )}

        <LicenseBlock article={article} />
      </div>
    </div>
  );
}
