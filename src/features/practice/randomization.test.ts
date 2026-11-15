import { describe, expect, it } from 'vitest';
import { createPracticeOrder, shuffleWithRng } from './randomization';
import { practiceArticle } from './practiceFixture';

function expectPermutation(order: number[], length: number): void {
  expect(order).toHaveLength(length);
  expect([...order].sort((left, right) => left - right)).toEqual(
    Array.from({ length }, (_, index) => index),
  );
}

describe('practice randomization', () => {
  it('shuffles with Fisher-Yates using the injected RNG', () => {
    const first = shuffleWithRng(['a', 'b', 'c', 'd'], () => 0);
    const second = shuffleWithRng(['a', 'b', 'c', 'd'], () => 0);

    expect(first).toEqual(second);
    expect(first).toEqual(['b', 'c', 'd', 'a']);
    expect([...first].sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps an out-of-range RNG value inside the array', () => {
    const result = shuffleWithRng([0, 1, 2, 3], () => 1);

    expect(result).toEqual([0, 1, 2, 3]);
  });

  it('produces bijective question and option orders without mutating the input', () => {
    const before = JSON.stringify(practiceArticle.questions);

    const order = createPracticeOrder(practiceArticle.questions, () => 0);

    expect(order.questionOrder).toHaveLength(practiceArticle.questions.length);
    expect([...order.questionOrder].sort()).toEqual(
      practiceArticle.questions.map((question) => question.id).sort(),
    );
    for (const question of practiceArticle.questions) {
      expectPermutation(
        order.optionOrders[question.id],
        question.options.length,
      );
    }
    expect(JSON.stringify(practiceArticle.questions)).toBe(before);
  });

  it('uses a different order when the injected RNG changes', () => {
    const zeroOrder = createPracticeOrder(practiceArticle.questions, () => 0);
    const highOrder = createPracticeOrder(
      practiceArticle.questions,
      () => 0.999,
    );

    expect(zeroOrder.questionOrder).not.toEqual(highOrder.questionOrder);
    expect(highOrder.questionOrder).toEqual(
      practiceArticle.questions.map((question) => question.id),
    );
  });
});
