import { useCallback, useEffect, useRef, useState } from 'react';
import { appendSession } from '../../lib/storage';
import { scorePractice } from '../../lib/scoring';
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
 * Owns the practice attempt state and writes exactly one PracticeSession when
 * the page unmounts after a submit. The duration is frozen at submit time.
 */
export function usePracticeSession(article: Article): PracticeSessionState {
  const [answers, setAnswers] = useState<Record<string, number | null>>({});
  const [markedWords, setMarkedWords] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [results, setResults] = useState<PracticeAnswer[]>([]);
  const [frozenMs, setFrozenMs] = useState<number | null>(null);

  const answersRef = useRef(answers);
  answersRef.current = answers;
  const markedWordsRef = useRef(markedWords);
  markedWordsRef.current = markedWords;

  const startedAtRef = useRef<string | null>(null);
  if (startedAtRef.current === null) {
    startedAtRef.current = new Date().toISOString();
  }
  const durationRef = useRef<number | null>(null);
  const submittedRef = useRef(false);
  const resultRef = useRef<{ score: number; results: PracticeAnswer[] }>({
    score: 0,
    results: [],
  });
  const savedRef = useRef(false);

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
    setMarkedWords((previous) =>
      previous.includes(trimmed) ? previous : [...previous, trimmed],
    );
  }, []);

  const submit = useCallback(
    (elapsedMs: number) => {
      if (submittedRef.current) return;

      const outcome = scorePractice(
        article,
        answersRef.current,
        markedWordsRef.current,
      );
      durationRef.current = elapsedMs;
      submittedRef.current = true;
      resultRef.current = { score: outcome.score, results: outcome.results };
      setScore(outcome.score);
      setResults(outcome.results);
      setFrozenMs(elapsedMs);
      setSubmitted(true);
    },
    [article],
  );

  useEffect(() => {
    return () => {
      if (
        !submittedRef.current ||
        durationRef.current === null ||
        savedRef.current
      ) {
        return;
      }
      savedRef.current = true;
      const session: PracticeSession = {
        articleId: article.id,
        startedAt: startedAtRef.current ?? new Date().toISOString(),
        durationMs: durationRef.current,
        score: resultRef.current.score,
        total: article.questions.length,
        answers: resultRef.current.results,
        markedWords: markedWordsRef.current,
      };
      appendSession('practice-sessions', session);
    };
  }, [article.id, article.questions.length]);

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
