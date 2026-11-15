export type RandomSource = () => number;

export interface PracticeQuestionLike {
  id: string;
  options: readonly string[];
  /** Included in the draft signature when available. */
  prompt?: string;
  /** Included in the draft signature when available. */
  answerIndex?: number;
}

export interface PracticeOrder {
  /** Question ids in display order. */
  questionOrder: string[];
  /** Per-question original option indices in display order. */
  optionOrders: Record<string, number[]>;
}

function randomIndex(rng: RandomSource, upperExclusive: number): number {
  const value = rng();
  if (!(value > 0)) return 0;
  if (value >= 1) return upperExclusive - 1;
  return Math.floor(value * upperExclusive);
}

/** Fisher-Yates shuffle over a copy; the injected RNG keeps tests repeatable. */
export function shuffleWithRng<T>(
  items: readonly T[],
  rng: RandomSource,
): T[] {
  const result = items.slice();
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(rng, index + 1);
    const current = result[index];
    result[index] = result[swapIndex];
    result[swapIndex] = current;
  }
  return result;
}

/**
 * Creates display orders only. Answers and saved records keep using the
 * original article question and option indices.
 */
export function createPracticeOrder(
  questions: readonly PracticeQuestionLike[],
  rng: RandomSource,
): PracticeOrder {
  const optionOrders: Record<string, number[]> = {};
  for (const question of questions) {
    optionOrders[question.id] = shuffleWithRng(
      question.options.map((_, index) => index),
      rng,
    );
  }
  return {
    questionOrder: shuffleWithRng(
      questions.map((question) => question.id),
      rng,
    ),
    optionOrders,
  };
}
