import { useCallback, useEffect, useRef, useState } from 'react';
import { scorePractice } from '../../lib/scoring';
import {
  createRecordId,
  readStudyRecords,
  savePracticeSession,
} from '../data/studyData';
import type { Article } from '../../types/content';
import type { PracticeAnswer, PracticeSession } from '../../types/progress';
import {
  clearPracticeDraft,
  createPracticeDraft,
  getCompletionStamp,
  loadPracticeDraft,
  savePracticeDraft,
  type PracticeDraft,
} from './practiceDraft';
import type { RandomSource } from './randomization';

export interface PracticeSessionState {
  answers: Record<string, number | null>;
  markedWords: string[];
  submitted: boolean;
  score: number;
  total: number;
  results: PracticeAnswer[];
  /** Duration frozen at submit time; null before submitting. */
  frozenMs: number | null;
  /** Article question ids in display order. */
  questionOrder: string[];
  /** Original option indices in display order, keyed by question id. */
  optionOrders: Record<string, number[]>;
  /** Elapsed practice time restored from a draft; 0 for a new attempt. */
  initialElapsedMs: number;
  answerQuestion: (questionId: string, optionIndex: number) => void;
  markWord: (word: string) => void;
  /** Persists the total elapsed time since the attempt started. */
  checkpointElapsed: (elapsedMs: number) => void;
  submit: (elapsedMs: number) => void;
}

export interface PracticeSessionOptions {
  /** Injected Fisher-Yates RNG for deterministic behavior tests. */
  rng?: RandomSource;
  /** Injected clock for completion-date tests. */
  now?: () => Date;
}

type CompletedPracticeSession = PracticeSession & {
  completedAt?: string;
  completedDay?: string;
};

interface InitialAttempt {
  draft: PracticeDraft;
  restored: boolean;
}

function defaultNow(): Date {
  return new Date();
}

const DRAFT_OWNERSHIP_ERROR =
  'Another practice attempt is already in progress for this article.';

function findSavedPracticeRecord(id: string | undefined) {
  if (!id) return undefined;
  return readStudyRecords().practiceSessions.find(
    (session) => session.id === id,
  );
}

/**
 * Single write gate for drafts. A valid draft stored under another attempt id
 * must not be replaced; only an already-completed stale draft may be replaced
 * by a freshly initialized attempt.
 */
function persistPracticeDraft(
  article: Article,
  draft: PracticeDraft,
  mode: 'strict' | 'silent',
): boolean {
  const storedDraft = loadPracticeDraft(article);
  if (storedDraft && storedDraft.id !== draft.id) {
    const storedIsCompleted = Boolean(findSavedPracticeRecord(storedDraft.id));
    const draftIsCompleted = Boolean(findSavedPracticeRecord(draft.id));
    if (!storedIsCompleted || draftIsCompleted) {
      if (mode === 'strict') throw new Error(DRAFT_OWNERSHIP_ERROR);
      return false;
    }
  }

  savePracticeDraft(draft);
  return true;
}

function clearOwnedPracticeDraft(article: Article, draftId: string): void {
  const storedDraft = loadPracticeDraft(article);
  if (storedDraft && storedDraft.id !== draftId) return;
  clearPracticeDraft(article.id);
}

function initializeAttempt(
  article: Article,
  options: PracticeSessionOptions,
): InitialAttempt {
  const restored = loadPracticeDraft(article);
  if (restored) {
    if (!findSavedPracticeRecord(restored.id)) {
      return { draft: restored, restored: true };
    }
    try {
      clearOwnedPracticeDraft(article, restored.id);
    } catch {
      // The stale draft is overwritten by the fresh attempt when possible.
    }
  }

  const now = options.now ?? defaultNow;
  return {
    draft: createPracticeDraft({
      article,
      id: createRecordId('practice'),
      startedAt: now().toISOString(),
      rng: options.rng,
    }),
    restored: false,
  };
}

/**
 * Owns the practice attempt state. A per-article draft keeps the shuffled
 * display order, answers, marked words and elapsed time across remounts; it is
 * cleared only after the submitted record is saved. Answers and saved records
 * always use original article question and option indices.
 */
export function usePracticeSession(
  article: Article,
  options: PracticeSessionOptions = {},
): PracticeSessionState {
  const [initial] = useState(() => initializeAttempt(article, options));
  const draft = initial.draft;
  const [answers, setAnswers] = useState<Record<string, number | null>>(
    draft.answers,
  );
  const [markedWords, setMarkedWords] = useState<string[]>(draft.markedWords);
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [results, setResults] = useState<PracticeAnswer[]>([]);
  const [frozenMs, setFrozenMs] = useState<number | null>(null);

  const draftRef = useRef(draft);
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const markedWordsRef = useRef(markedWords);
  markedWordsRef.current = markedWords;
  const nowRef = useRef(options.now ?? defaultNow);
  nowRef.current = options.now ?? defaultNow;

  const submittedRef = useRef(false);
  const savedSessionRef = useRef<CompletedPracticeSession | null>(null);

  const total = article.questions.length;

  useEffect(() => {
    if (initial.restored) return;
    try {
      persistPracticeDraft(article, draftRef.current, 'silent');
    } catch {
      // Keep the attempt usable in memory; later interactions surface the
      // storage error instead of crashing the initial render.
    }
  }, [initial.restored]);

  const answerQuestion = useCallback(
    (questionId: string, optionIndex: number) => {
      if (submittedRef.current) return;
      const question = article.questions.find(
        (candidate) => candidate.id === questionId,
      );
      if (!question) return;
      if (
        !Number.isInteger(optionIndex) ||
        optionIndex < 0 ||
        optionIndex >= question.options.length
      ) {
        return;
      }

      const nextAnswers = {
        ...draftRef.current.answers,
        [questionId]: optionIndex,
      };
      const nextDraft: PracticeDraft = {
        ...draftRef.current,
        answers: nextAnswers,
      };

      persistPracticeDraft(article, nextDraft, 'strict');
      draftRef.current = nextDraft;
      answersRef.current = nextAnswers;
      setAnswers(nextAnswers);
    },
    [article],
  );

  const markWord = useCallback((word: string) => {
    const trimmed = word.trim();
    if (!trimmed) return;

    const submittedSession = savedSessionRef.current;
    if (submittedRef.current && submittedSession) {
      const stored = findSavedPracticeRecord(submittedSession.id);
      const current = stored ?? submittedSession;
      if (current.markedWords.includes(trimmed)) {
        savedSessionRef.current = current;
        markedWordsRef.current = current.markedWords;
        setMarkedWords(current.markedWords);
        return;
      }
      const next: CompletedPracticeSession = {
        ...current,
        markedWords: [...current.markedWords, trimmed],
      };
      savePracticeSession(next);
      savedSessionRef.current = next;
      markedWordsRef.current = next.markedWords;
      setMarkedWords(next.markedWords);
      return;
    }

    const currentDraft = draftRef.current;
    if (currentDraft.markedWords.includes(trimmed)) return;
    const nextWords = [...currentDraft.markedWords, trimmed];
    const nextDraft: PracticeDraft = {
      ...currentDraft,
      markedWords: nextWords,
    };

    persistPracticeDraft(article, nextDraft, 'strict');
    draftRef.current = nextDraft;
    markedWordsRef.current = nextWords;
    setMarkedWords(nextWords);
  }, [article]);

  const checkpointElapsed = useCallback(
    (elapsedMs: number) => {
      if (submittedRef.current) return;
      if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return;

      const nextDraft: PracticeDraft = {
        ...draftRef.current,
        elapsedMs,
      };

      try {
        if (!persistPracticeDraft(article, nextDraft, 'silent')) return;
      } catch {
        // Timer checkpoints are best-effort; answer/mark/submit writes still
        // report storage failures to the caller.
      }
      draftRef.current = nextDraft;
    },
    [article],
  );

  const submit = useCallback(
    (elapsedMs: number) => {
      if (submittedRef.current) return;

      const currentDraft = draftRef.current;
      const savedRecord = findSavedPracticeRecord(currentDraft.id);
      if (savedRecord) {
        const storedAnswers: Record<string, number | null> = {};
        for (const answer of savedRecord.answers) {
          storedAnswers[answer.questionId] = answer.selectedIndex;
        }
        savedSessionRef.current = savedRecord;
        submittedRef.current = true;
        answersRef.current = storedAnswers;
        markedWordsRef.current = savedRecord.markedWords;
        setAnswers(storedAnswers);
        setMarkedWords(savedRecord.markedWords);
        setScore(savedRecord.score);
        setResults(savedRecord.answers);
        setFrozenMs(savedRecord.durationMs);
        setSubmitted(true);
        try {
          clearOwnedPracticeDraft(article, currentDraft.id);
        } catch {
          // The completed record is already saved; cleanup is best-effort.
        }
        return;
      }

      const durationMs =
        Number.isFinite(elapsedMs) && elapsedMs >= 0
          ? elapsedMs
          : currentDraft.elapsedMs;
      const outcome = scorePractice(
        article,
        answersRef.current,
        markedWordsRef.current,
      );
      const completion = getCompletionStamp(nowRef.current());
      const session: CompletedPracticeSession = {
        id: currentDraft.id,
        articleId: article.id,
        startedAt: currentDraft.startedAt,
        durationMs,
        score: outcome.score,
        total: article.questions.length,
        answers: outcome.results,
        markedWords: [...markedWordsRef.current],
        completedAt: completion.completedAt,
        completedDay: completion.completedDay,
      };

      savePracticeSession(session);

      savedSessionRef.current = session;
      submittedRef.current = true;
      setScore(outcome.score);
      setResults(outcome.results);
      setFrozenMs(durationMs);
      setSubmitted(true);

      try {
        clearOwnedPracticeDraft(article, currentDraft.id);
      } catch {
        // The record is already saved; a failed cleanup must not report the
        // submit as failed or erase the result.
      }
    },
    [article],
  );

  return {
    answers,
    markedWords,
    submitted,
    score,
    total,
    results,
    frozenMs,
    questionOrder: draft.questionOrder,
    optionOrders: draft.optionOrders,
    initialElapsedMs: draft.elapsedMs,
    answerQuestion,
    markWord,
    checkpointElapsed,
    submit,
  };
}
