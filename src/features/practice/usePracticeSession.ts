import { useCallback, useRef, useState } from 'react';
import { scorePractice } from '../../lib/scoring';
import { createRecordId, savePracticeSession } from '../data/studyData';
import type { Article } from '../../types/content';
import type { PracticeAnswer, PracticeSession } from '../../types/progress';

export interface PracticeSessionState {
  answers: Record<string, number | null>;
  markedWords: string[];
  submitted: boolean;
  score: number;
  total: number;
  results: PracticeAnswer[];
  /** Duration frozen at submit time; null before submitting. */
  frozenMs: number | null;
  answerQuestion: (questionId: string, optionIndex: number) => void;
  markWord: (word: string) => void;
  submit: (elapsedMs: number) => void;
}

/**
 * Owns the practice attempt state and persists exactly one PracticeSession at
 * submit time. The duration is frozen when submitting, and the storage error
 * propagates to the caller instead of being swallowed.
 */
export function usePracticeSession(article: Article): PracticeSessionState {
  const [answers, setAnswers] = useState<Record<string, number | null>>({});
  const [markedWords, setMarkedWords] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [results, setResults] = useState<PracticeAnswer[]>([]);
  const [frozenMs, setFrozenMs] = useState<number | null>(null);
  const [sessionId] = useState(() => createRecordId('practice'));

  const answersRef = useRef(answers);
  answersRef.current = answers;
  const markedWordsRef = useRef(markedWords);
  markedWordsRef.current = markedWords;

  const startedAtRef = useRef<string | null>(null);
  if (startedAtRef.current === null) {
    startedAtRef.current = new Date().toISOString();
  }
  const submittedRef = useRef(false);
  const savedSessionRef = useRef<PracticeSession | null>(null);

  const total = article.questions.length;

  const answerQuestion = useCallback(
    (questionId: string, optionIndex: number) => {
      if (submittedRef.current) return;
      setAnswers((previous) => ({
        ...previous,
        [questionId]: optionIndex,
      }));
    },
    [],
  );

  const markWord = useCallback((word: string) => {
    const trimmed = word.trim();
    if (!trimmed) return;

    const submittedSession = savedSessionRef.current;
    if (submittedRef.current && submittedSession) {
      if (submittedSession.markedWords.includes(trimmed)) return;
      const next: PracticeSession = {
        ...submittedSession,
        markedWords: [...submittedSession.markedWords, trimmed],
      };
      savePracticeSession(next);
      savedSessionRef.current = next;
      markedWordsRef.current = next.markedWords;
      setMarkedWords(next.markedWords);
      return;
    }

    const current = markedWordsRef.current;
    if (current.includes(trimmed)) return;
    const nextWords = [...current, trimmed];
    markedWordsRef.current = nextWords;
    setMarkedWords(nextWords);
  }, []);

  const submit = useCallback(
    (elapsedMs: number) => {
      if (submittedRef.current) return;

      const outcome = scorePractice(
        article,
        answersRef.current,
        markedWordsRef.current,
      );
      const session: PracticeSession = {
        id: sessionId,
        articleId: article.id,
        startedAt: startedAtRef.current ?? new Date().toISOString(),
        durationMs: elapsedMs,
        score: outcome.score,
        total: article.questions.length,
        answers: outcome.results,
        markedWords: markedWordsRef.current,
      };

      savePracticeSession(session);

      savedSessionRef.current = session;
      submittedRef.current = true;
      setScore(outcome.score);
      setResults(outcome.results);
      setFrozenMs(elapsedMs);
      setSubmitted(true);
    },
    [article, sessionId],
  );

  return {
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
  };
}
