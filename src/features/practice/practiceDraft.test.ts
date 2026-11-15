import { beforeEach, describe, expect, it } from 'vitest';
import { createBackup } from '../data/backup';
import {
  clearPracticeDraft,
  createPracticeDraft,
  createPracticeSignature,
  getCompletionStamp,
  loadPracticeDraft,
  localDayKey,
  practiceDraftKey,
  savePracticeDraft,
} from './practiceDraft';
import { practiceArticle, stalePracticeArticle } from './practiceFixture';

function makeDraft(article = practiceArticle, id = 'practice-1') {
  return createPracticeDraft({
    article,
    id,
    startedAt: '2026-11-14T20:00:00.000Z',
    rng: () => 0,
  });
}

describe('practice drafts', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips one draft per article and clears only that article', () => {
    const first = makeDraft();
    const secondArticle = { ...practiceArticle, id: 'article-b' };
    const second = makeDraft(secondArticle, 'practice-2');

    savePracticeDraft(first);
    savePracticeDraft(second);

    expect(loadPracticeDraft(practiceArticle)).toEqual(first);
    expect(loadPracticeDraft(secondArticle)).toEqual(second);
    expect(loadPracticeDraft(practiceArticle)?.id).toBe('practice-1');
    expect(loadPracticeDraft(secondArticle)?.id).toBe('practice-2');

    clearPracticeDraft(practiceArticle.id);
    expect(loadPracticeDraft(practiceArticle)).toBeNull();
    expect(loadPracticeDraft(secondArticle)).toEqual(second);
  });

  it('rejects a draft whose article question/option signature changed', () => {
    savePracticeDraft(makeDraft());

    expect(loadPracticeDraft(stalePracticeArticle)).toBeNull();
    expect(
      createPracticeSignature(stalePracticeArticle.questions),
    ).not.toBe(createPracticeSignature(practiceArticle.questions));
  });

  it('rejects a draft after a prompt or answer-index correction', () => {
    const draft = makeDraft();
    const correctedAnswer = {
      ...practiceArticle,
      questions: practiceArticle.questions.map((question, index) =>
        index === 0 ? { ...question, answerIndex: 2 } : question,
      ),
    };
    const correctedPrompt = {
      ...practiceArticle,
      questions: practiceArticle.questions.map((question, index) =>
        index === 0 ? { ...question, prompt: 'Question corrigée ?' } : question,
      ),
    };

    savePracticeDraft(draft);
    expect(
      createPracticeSignature(correctedAnswer.questions),
    ).not.toBe(createPracticeSignature(practiceArticle.questions));
    expect(loadPracticeDraft(correctedAnswer)).toBeNull();

    savePracticeDraft(draft);
    expect(
      createPracticeSignature(correctedPrompt.questions),
    ).not.toBe(createPracticeSignature(practiceArticle.questions));
    expect(loadPracticeDraft(correctedPrompt)).toBeNull();
  });

  it('rejects malformed JSON without throwing', () => {
    localStorage.setItem(
      `frp:${practiceDraftKey(practiceArticle.id)}`,
      '{not-json',
    );

    expect(() => loadPracticeDraft(practiceArticle)).not.toThrow();
    expect(loadPracticeDraft(practiceArticle)).toBeNull();
  });

  it('rejects a draft with a non-bijective option order', () => {
    const draft = makeDraft();
    const broken = {
      ...draft,
      optionOrders: {
        ...draft.optionOrders,
        q1: [0, 0, 1, 2],
      },
    };
    localStorage.setItem(
      `frp:${practiceDraftKey(practiceArticle.id)}`,
      JSON.stringify(broken),
    );

    expect(loadPracticeDraft(practiceArticle)).toBeNull();
  });

  it('rejects a draft with an out-of-range answer', () => {
    const draft = makeDraft();
    const broken = {
      ...draft,
      answers: { q1: 99 },
    };
    localStorage.setItem(
      `frp:${practiceDraftKey(practiceArticle.id)}`,
      JSON.stringify(broken),
    );

    expect(loadPracticeDraft(practiceArticle)).toBeNull();
  });

  it('is not part of study backups', () => {
    savePracticeDraft(makeDraft());

    const backupText = JSON.stringify(createBackup());

    expect(backupText).not.toContain('questionOrder');
    expect(backupText).not.toContain('practice-draft');
    expect(
      localStorage.getItem(`frp:${practiceDraftKey(practiceArticle.id)}`),
    ).not.toBeNull();
  });

  it('stamps an ISO completion time and local calendar day across midnight', () => {
    expect(localDayKey(new Date(2026, 0, 2, 3, 4, 5))).toBe('2026-01-02');

    const beforeMidnight = new Date(2026, 10, 14, 23, 58, 0);
    const afterMidnight = new Date(2026, 10, 15, 0, 2, 0);

    expect(getCompletionStamp(beforeMidnight)).toEqual({
      completedAt: beforeMidnight.toISOString(),
      completedDay: '2026-11-14',
    });
    expect(getCompletionStamp(afterMidnight)).toEqual({
      completedAt: afterMidnight.toISOString(),
      completedDay: '2026-11-15',
    });
  });
});
