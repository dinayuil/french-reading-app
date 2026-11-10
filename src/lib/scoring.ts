import type { Article } from '../types/content';
import type { PracticeAnswer } from '../types/progress';

export interface PracticeScore {
  score: number;
  total: number;
  results: PracticeAnswer[];
}

/**
 * Grades a practice attempt in article question order.
 *
 * A missing or null answer is unanswered and therefore wrong. Marked words are
 * session-level, so they are not part of the score; the caller stores them on
 * the saved session.
 */
export function scorePractice(
  article: Article,
  answers: Record<string, number | null>,
  markedWords: string[],
): PracticeScore {
  void markedWords;

  const results: PracticeAnswer[] = article.questions.map((question) => {
    const selectedIndex = answers[question.id] ?? null;
    return {
      questionId: question.id,
      selectedIndex,
      correct: selectedIndex === question.answerIndex,
    };
  });

  return {
    score: results.filter((result) => result.correct).length,
    total: article.questions.length,
    results,
  };
}
