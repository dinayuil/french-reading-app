import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useLayoutEffect, type ReactNode } from 'react';
import {
  createBackup,
  mergeBackups,
  readStudyData,
} from '../data/backup';
import { savePracticeSession } from '../data/studyData';
import type { PracticeSession } from '../../types/progress';
import {
  createPracticeDraft,
  createPracticeSignature,
  loadPracticeDraft,
  practiceDraftKey,
  savePracticeDraft,
} from './practiceDraft';
import { usePracticeSession } from './usePracticeSession';
import { practiceArticle, stalePracticeArticle } from './practiceFixture';

vi.mock('../data/studyData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/studyData')>();
  return {
    ...actual,
    savePracticeSession: vi.fn(actual.savePracticeSession),
  };
});

type CompletedPracticeSession = PracticeSession & {
  completedAt?: string;
  completedDay?: string;
};

const saveMock = vi.mocked(savePracticeSession);

function lastSavedSession(): CompletedPracticeSession | undefined {
  const calls = saveMock.mock.calls;
  return calls[calls.length - 1]?.[0] as
    | CompletedPracticeSession
    | undefined;
}

describe('usePracticeSession attempts', () => {
  beforeEach(() => {
    localStorage.clear();
    saveMock.mockClear();
  });

  it('keeps the order stable across rerenders and remounts', () => {
    const first = renderHook(() =>
      usePracticeSession(practiceArticle, { rng: () => 0 }),
    );
    const initialOrder = first.result.current.questionOrder;
    const initialOptionOrders = first.result.current.optionOrders;
    const initialDraft = loadPracticeDraft(practiceArticle);

    expect(initialDraft).not.toBeNull();
    expect(initialDraft?.id).toEqual(expect.any(String));
    expect(initialOrder).not.toEqual(['q1', 'q2', 'q3']);
    expect([...initialOrder].sort()).toEqual(['q1', 'q2', 'q3']);

    first.rerender();

    expect(first.result.current.questionOrder).toEqual(initialOrder);
    expect(first.result.current.optionOrders).toEqual(initialOptionOrders);

    act(() => {
      first.result.current.answerQuestion('q1', 1);
      first.result.current.markWord('mot');
      first.result.current.checkpointElapsed(12_345);
    });

    expect(first.result.current.answers).toEqual({ q1: 1 });
    expect(first.result.current.markedWords).toEqual(['mot']);

    first.unmount();

    const restored = renderHook(() =>
      usePracticeSession(practiceArticle, { rng: () => 0.999 }),
    );

    expect(restored.result.current.questionOrder).toEqual(initialOrder);
    expect(restored.result.current.optionOrders).toEqual(initialOptionOrders);
    expect(restored.result.current.answers).toEqual({ q1: 1 });
    expect(restored.result.current.markedWords).toEqual(['mot']);
    expect(restored.result.current.initialElapsedMs).toBe(12_345);
    expect(loadPracticeDraft(practiceArticle)?.id).toBe(initialDraft?.id);
  });

  it('exposes bijective option orders and scores original option indices', () => {
    const { result } = renderHook(() =>
      usePracticeSession(practiceArticle, { rng: () => 0 }),
    );

    expect(result.current.optionOrders.q1).not.toEqual([0, 1, 2, 3]);
    for (const question of practiceArticle.questions) {
      const order = result.current.optionOrders[question.id];
      expect([...order].sort((left, right) => left - right)).toEqual(
        question.options.map((_, index) => index),
      );
      expect(order).toContain(question.answerIndex);
    }

    act(() => {
      for (const question of practiceArticle.questions) {
        result.current.answerQuestion(question.id, question.answerIndex);
      }
    });
    act(() => {
      result.current.submit(1_234);
    });

    expect(result.current.score).toBe(3);
    expect(readStudyData().practiceSessions[0].answers).toEqual(
      practiceArticle.questions.map((question) => ({
        questionId: question.id,
        selectedIndex: question.answerIndex,
        correct: true,
      })),
    );
  });

  it('resumes the elapsed time from the draft and submits the UI total', () => {
    const first = renderHook(() =>
      usePracticeSession(practiceArticle, { rng: () => 0 }),
    );

    act(() => {
      first.result.current.checkpointElapsed(42_000);
    });
    first.unmount();

    const restored = renderHook(() =>
      usePracticeSession(practiceArticle, { rng: () => 0.999 }),
    );

    expect(restored.result.current.initialElapsedMs).toBe(42_000);

    act(() => {
      restored.result.current.submit(47_000);
    });

    expect(readStudyData().practiceSessions[0].durationMs).toBe(47_000);
  });

  it('starts fresh when the stored draft has another article signature', () => {
    const stale = createPracticeDraft({
      article: stalePracticeArticle,
      id: 'stale-attempt',
      startedAt: '2026-11-14T20:00:00.000Z',
      rng: () => 0,
    });
    savePracticeDraft({
      ...stale,
      answers: { q1: 2 },
      markedWords: ['ancien'],
      elapsedMs: 9_999,
    });

    const { result } = renderHook(() =>
      usePracticeSession(practiceArticle, { rng: () => 0.999 }),
    );

    expect(result.current.answers).toEqual({});
    expect(result.current.markedWords).toEqual([]);
    expect(result.current.initialElapsedMs).toBe(0);

    const current = loadPracticeDraft(practiceArticle);
    expect(current).not.toBeNull();
    expect(current?.id).not.toBe('stale-attempt');
    expect(current?.signature).toBe(
      createPracticeSignature(practiceArticle.questions),
    );
  });

  it('ignores malformed draft JSON and starts a usable attempt', () => {
    localStorage.setItem(
      `frp:${practiceDraftKey(practiceArticle.id)}`,
      '{not-json',
    );

    const { result } = renderHook(() =>
      usePracticeSession(practiceArticle, { rng: () => 0.999 }),
    );

    expect(result.current.answers).toEqual({});
    expect(result.current.initialElapsedMs).toBe(0);
    expect(loadPracticeDraft(practiceArticle)).not.toBeNull();
  });

  it('stamps completion with the local day across midnight', () => {
    let now = new Date(2026, 10, 14, 23, 58, 0);
    const startedAt = new Date(2026, 10, 14, 23, 58, 0).toISOString();
    const { result } = renderHook(() =>
      usePracticeSession(practiceArticle, {
        rng: () => 0,
        now: () => now,
      }),
    );

    now = new Date(2026, 10, 15, 0, 2, 0);

    act(() => {
      result.current.submit(5_000);
    });

    const saved = lastSavedSession();
    expect(saved?.startedAt).toBe(startedAt);
    expect(saved?.completedAt).toBe(now.toISOString());
    expect(saved?.completedDay).toBe('2026-11-15');

    const stored = readStudyData().practiceSessions[0];
    expect(stored?.completedAt).toBe(now.toISOString());
    expect(stored?.completedDay).toBe('2026-11-15');
  });

  it('keeps the frozen duration and the draft when saving fails, then retries', () => {
    const { result } = renderHook(() =>
      usePracticeSession(practiceArticle, { rng: () => 0 }),
    );

    act(() => {
      result.current.answerQuestion('q1', 1);
      result.current.markWord('mot');
      result.current.checkpointElapsed(2_000);
    });

    saveMock.mockImplementationOnce(() => {
      throw new Error('quota exceeded');
    });

    expect(() => {
      act(() => {
        result.current.submit(5_000);
      });
    }).toThrow('quota exceeded');

    expect(result.current.submitted).toBe(false);
    expect(result.current.frozenMs).toBeNull();
    expect(readStudyData().practiceSessions).toHaveLength(0);
    expect(loadPracticeDraft(practiceArticle)).toMatchObject({
      answers: { q1: 1 },
      markedWords: ['mot'],
      elapsedMs: 2_000,
    });

    act(() => {
      result.current.submit(6_000);
    });

    expect(result.current.submitted).toBe(true);
    expect(result.current.frozenMs).toBe(6_000);
    expect(readStudyData().practiceSessions).toHaveLength(1);
    expect(readStudyData().practiceSessions[0].durationMs).toBe(6_000);
    expect(loadPracticeDraft(practiceArticle)).toBeNull();

    act(() => {
      result.current.submit(9_999);
    });
    expect(result.current.frozenMs).toBe(6_000);
    expect(readStudyData().practiceSessions).toHaveLength(1);
  });

  it('preserves completion fields when marking words after submit', () => {
    const fixedNow = new Date(2026, 10, 15, 9, 30, 0);
    const { result } = renderHook(() =>
      usePracticeSession(practiceArticle, {
        rng: () => 0,
        now: () => fixedNow,
      }),
    );

    act(() => {
      result.current.markWord('avant');
    });
    act(() => {
      result.current.submit(5_000);
    });

    const submitted = lastSavedSession();
    expect(submitted?.completedAt).toBe(fixedNow.toISOString());
    expect(submitted?.completedDay).toBe('2026-11-15');
    expect(submitted?.markedWords).toEqual(['avant']);

    act(() => {
      result.current.markWord('après');
    });

    expect(lastSavedSession()).toMatchObject({
      id: submitted?.id,
      durationMs: 5_000,
      markedWords: ['avant', 'après'],
      completedAt: submitted?.completedAt,
      completedDay: submitted?.completedDay,
    });
    expect(readStudyData().practiceSessions[0]).toMatchObject({
      markedWords: ['avant', 'après'],
      completedAt: fixedNow.toISOString(),
      completedDay: '2026-11-15',
    });
    expect(loadPracticeDraft(practiceArticle)).toBeNull();
  });

  it('starts a new order after a submitted attempt is mounted again', () => {
    const first = renderHook(() =>
      usePracticeSession(practiceArticle, { rng: () => 0 }),
    );
    const firstOrder = first.result.current.questionOrder;
    const firstDraft = loadPracticeDraft(practiceArticle);

    act(() => {
      first.result.current.submit(1_000);
    });
    expect(loadPracticeDraft(practiceArticle)).toBeNull();
    first.unmount();

    const second = renderHook(() =>
      usePracticeSession(practiceArticle, { rng: () => 0.999 }),
    );

    expect(second.result.current.questionOrder).not.toEqual(firstOrder);
    expect(second.result.current.questionOrder).toEqual(['q1', 'q2', 'q3']);
    expect(second.result.current.answers).toEqual({});
    expect(second.result.current.initialElapsedMs).toBe(0);
    expect(loadPracticeDraft(practiceArticle)?.id).not.toBe(firstDraft?.id);
  });

  it('converges a second mounted attempt to the saved record without overwriting it', () => {
    const firstNow = new Date(2026, 10, 15, 10, 0, 0);
    const secondNow = new Date(2026, 10, 16, 11, 0, 0);
    const first = renderHook(() =>
      usePracticeSession(practiceArticle, {
        rng: () => 0,
        now: () => firstNow,
      }),
    );
    const sharedDraft = loadPracticeDraft(practiceArticle);
    expect(sharedDraft).not.toBeNull();

    const second = renderHook(() =>
      usePracticeSession(practiceArticle, {
        now: () => secondNow,
      }),
    );
    expect(loadPracticeDraft(practiceArticle)?.id).toBe(sharedDraft?.id);

    act(() => {
      first.result.current.markWord('alpha');
      first.result.current.answerQuestion('q1', 1);
      first.result.current.answerQuestion('q2', 0);
    });
    act(() => {
      second.result.current.markWord('beta');
      second.result.current.answerQuestion('q3', 4);
    });

    act(() => {
      first.result.current.submit(1_000);
    });

    const firstRecord = readStudyData().practiceSessions[0];
    expect(firstRecord).toMatchObject({
      id: sharedDraft?.id,
      durationMs: 1_000,
      score: 2,
      completedAt: firstNow.toISOString(),
      completedDay: '2026-11-15',
      markedWords: ['alpha'],
    });
    const backupBeforeSecondSubmit = createBackup();

    const third = renderHook(() =>
      usePracticeSession(practiceArticle, { rng: () => 0.5 }),
    );
    const thirdDraft = loadPracticeDraft(practiceArticle);
    expect(thirdDraft?.id).not.toBe(firstRecord.id);

    act(() => {
      second.result.current.submit(2_000);
    });

    expect(second.result.current.submitted).toBe(true);
    expect(second.result.current.frozenMs).toBe(1_000);
    expect(second.result.current.score).toBe(2);
    expect(second.result.current.results).toEqual(firstRecord.answers);
    expect(second.result.current.markedWords).toEqual(['alpha']);
    expect(readStudyData().practiceSessions).toEqual([firstRecord]);
    expect(loadPracticeDraft(practiceArticle)?.id).toBe(thirdDraft?.id);

    const backupAfterSecondSubmit = createBackup();
    const merged = mergeBackups(
      backupBeforeSecondSubmit,
      backupAfterSecondSubmit,
    );
    expect(merged.data.practiceSessions).toHaveLength(1);
    expect(merged.data.practiceSessions[0]).toMatchObject({
      id: firstRecord.id,
      durationMs: 1_000,
      completedDay: '2026-11-15',
    });

    act(() => {
      first.result.current.markWord('gamma');
    });
    act(() => {
      second.result.current.markWord('delta');
    });
    act(() => {
      first.result.current.markWord('epsilon');
    });
    act(() => {
      second.result.current.markWord('zeta');
    });

    expect(readStudyData().practiceSessions).toHaveLength(1);
    expect(readStudyData().practiceSessions[0]).toMatchObject({
      id: firstRecord.id,
      durationMs: 1_000,
      completedAt: firstNow.toISOString(),
      completedDay: '2026-11-15',
      markedWords: ['alpha', 'gamma', 'delta', 'epsilon', 'zeta'],
    });
    expect(second.result.current.markedWords).toEqual([
      'alpha',
      'gamma',
      'delta',
      'epsilon',
      'zeta',
    ]);

    third.unmount();
  });

  it('does not overwrite another active draft from the initial save effect', () => {
    const competingDraft = createPracticeDraft({
      article: practiceArticle,
      id: 'practice-competing',
      startedAt: '2026-11-15T11:00:00.000Z',
      rng: () => 0.5,
    });

    function Wrapper({ children }: { children: ReactNode }) {
      useLayoutEffect(() => {
        savePracticeDraft(competingDraft);
      }, []);
      return <>{children}</>;
    }

    const { unmount } = renderHook(
      () => usePracticeSession(practiceArticle, { rng: () => 0.999 }),
      { wrapper: Wrapper },
    );

    expect(loadPracticeDraft(practiceArticle)?.id).toBe('practice-competing');
    unmount();
  });

  it('does not let a stale attempt overwrite a newer attempt draft', () => {
    const firstNow = new Date(2026, 10, 15, 10, 0, 0);
    const secondNow = new Date(2026, 10, 16, 11, 0, 0);
    const thirdNow = new Date(2026, 10, 17, 12, 0, 0);
    const first = renderHook(() =>
      usePracticeSession(practiceArticle, {
        rng: () => 0,
        now: () => firstNow,
      }),
    );
    const sharedDraft = loadPracticeDraft(practiceArticle);
    expect(sharedDraft).not.toBeNull();

    const second = renderHook(() =>
      usePracticeSession(practiceArticle, {
        now: () => secondNow,
      }),
    );
    expect(loadPracticeDraft(practiceArticle)?.id).toBe(sharedDraft?.id);

    act(() => {
      first.result.current.markWord('alpha');
      first.result.current.answerQuestion('q1', 1);
    });
    act(() => {
      first.result.current.submit(1_000);
    });
    const firstRecord = readStudyData().practiceSessions[0];
    expect(firstRecord).toMatchObject({
      id: sharedDraft?.id,
      durationMs: 1_000,
      completedDay: '2026-11-15',
    });

    const third = renderHook(() =>
      usePracticeSession(practiceArticle, {
        rng: () => 0.5,
        now: () => thirdNow,
      }),
    );
    const thirdDraftBefore = loadPracticeDraft(practiceArticle);
    expect(thirdDraftBefore?.id).not.toBe(firstRecord.id);

    act(() => {
      third.result.current.markWord('charlie');
      third.result.current.answerQuestion('q2', 0);
      third.result.current.checkpointElapsed(7_000);
    });
    const thirdDraft = loadPracticeDraft(practiceArticle);
    expect(thirdDraft).toMatchObject({
      id: thirdDraftBefore?.id,
      answers: { q2: 0 },
      markedWords: ['charlie'],
      elapsedMs: 7_000,
    });

    act(() => {
      second.result.current.checkpointElapsed(2_000);
    });
    expect(loadPracticeDraft(practiceArticle)).toEqual(thirdDraft);

    expect(() => {
      act(() => {
        second.result.current.answerQuestion('q3', 4);
      });
    }).toThrow(/already in progress/i);
    expect(second.result.current.answers).toEqual({});
    expect(loadPracticeDraft(practiceArticle)).toEqual(thirdDraft);

    expect(() => {
      act(() => {
        second.result.current.markWord('stale');
      });
    }).toThrow(/already in progress/i);
    expect(second.result.current.markedWords).toEqual([]);
    expect(loadPracticeDraft(practiceArticle)).toEqual(thirdDraft);

    act(() => {
      second.result.current.checkpointElapsed(3_000);
    });
    expect(loadPracticeDraft(practiceArticle)).toEqual(thirdDraft);

    act(() => {
      second.result.current.submit(2_000);
    });
    expect(second.result.current.submitted).toBe(true);
    expect(second.result.current.frozenMs).toBe(1_000);
    expect(second.result.current.markedWords).toEqual(['alpha']);
    expect(readStudyData().practiceSessions).toEqual([firstRecord]);
    expect(loadPracticeDraft(practiceArticle)).toEqual(thirdDraft);

    act(() => {
      second.result.current.checkpointElapsed(4_000);
    });
    expect(loadPracticeDraft(practiceArticle)).toEqual(thirdDraft);
    second.unmount();

    act(() => {
      third.result.current.submit(7_000);
    });
    const records = readStudyData().practiceSessions;
    expect(records).toHaveLength(2);
    expect(records[0]).toEqual(firstRecord);
    expect(records.find((record) => record.id === thirdDraft?.id)).toMatchObject(
      {
        durationMs: 7_000,
        score: 1,
        markedWords: ['charlie'],
        completedDay: '2026-11-17',
      },
    );
    expect(loadPracticeDraft(practiceArticle)).toBeNull();
    third.unmount();
  });

  it('starts a fresh attempt when a completed draft survives cleanup failure', () => {
    const first = renderHook(() =>
      usePracticeSession(practiceArticle, { rng: () => 0 }),
    );
    const firstOrder = first.result.current.questionOrder;
    const firstDraft = loadPracticeDraft(practiceArticle);
    expect(firstDraft).not.toBeNull();

    act(() => {
      first.result.current.answerQuestion('q1', 1);
      first.result.current.markWord('mot');
    });

    const originalRemoveItem = Storage.prototype.removeItem;
    const removeItem = vi
      .spyOn(Storage.prototype, 'removeItem')
      .mockImplementation(function (this: Storage, key: string) {
        if (key === `frp:${practiceDraftKey(practiceArticle.id)}`) {
          throw new Error('cleanup blocked');
        }
        originalRemoveItem.call(this, key);
      });

    try {
      act(() => {
        first.result.current.submit(1_000);
      });

      expect(first.result.current.submitted).toBe(true);
      const saved = readStudyData().practiceSessions[0];
      expect(saved.id).toBe(firstDraft?.id);
      expect(loadPracticeDraft(practiceArticle)?.id).toBe(firstDraft?.id);

      first.unmount();

      const second = renderHook(() =>
        usePracticeSession(practiceArticle, { rng: () => 0.999 }),
      );

      expect(second.result.current.answers).toEqual({});
      expect(second.result.current.markedWords).toEqual([]);
      expect(second.result.current.initialElapsedMs).toBe(0);
      expect(second.result.current.questionOrder).not.toEqual(firstOrder);

      const freshDraft = loadPracticeDraft(practiceArticle);
      expect(freshDraft).not.toBeNull();
      expect(freshDraft?.id).not.toBe(saved.id);
      expect(freshDraft?.answers).toEqual({});
      expect(readStudyData().practiceSessions).toHaveLength(1);
    } finally {
      removeItem.mockRestore();
    }
  });

  it('surfaces a draft write failure without applying the answer', () => {
    const { result } = renderHook(() =>
      usePracticeSession(practiceArticle, { rng: () => 0 }),
    );
    const originalSetItem = Storage.prototype.setItem;
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(function (
        this: Storage,
        key: string,
        value: string,
      ) {
        if (key.startsWith('frp:practice-draft:')) {
          throw new Error('quota exceeded');
        }
        originalSetItem.call(this, key, value);
      });

    try {
      expect(() => {
        act(() => {
          result.current.answerQuestion('q1', 1);
        });
      }).toThrow('quota exceeded');

      expect(result.current.answers).toEqual({});
      expect(loadPracticeDraft(practiceArticle)?.answers).toEqual({});
    } finally {
      setItem.mockRestore();
    }

    act(() => {
      result.current.answerQuestion('q1', 1);
    });

    expect(result.current.answers).toEqual({ q1: 1 });
    expect(loadPracticeDraft(practiceArticle)?.answers).toEqual({ q1: 1 });
  });
});
