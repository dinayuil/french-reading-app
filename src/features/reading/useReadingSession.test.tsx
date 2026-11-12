import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useReadingSession } from './useReadingSession';
import { readStudyData } from '../data/backup';

function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', {
    value: state,
    writable: true,
    configurable: true,
  });
}

describe('useReadingSession', () => {
  let now = 0;

  beforeEach(() => {
    localStorage.clear();
    now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    setVisibility('visible');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    setVisibility('visible');
  });

  it('checkpoints on pagehide and updates the same session on unmount', () => {
    const { unmount } = renderHook(() => useReadingSession('article-a'));

    act(() => {
      now = 2_000;
      window.dispatchEvent(new Event('pagehide'));
    });

    const checkpoint = readStudyData().readingSessions;
    expect(checkpoint).toHaveLength(1);
    expect(checkpoint[0]).toMatchObject({
      articleId: 'article-a',
      durationMs: expect.any(Number),
    });
    expect(checkpoint[0].durationMs).toBeGreaterThanOrEqual(1_900);
    expect(checkpoint[0].durationMs).toBeLessThanOrEqual(2_100);
    const sessionId = checkpoint[0].id;

    act(() => {
      now = 4_000;
    });
    unmount();

    const final = readStudyData().readingSessions;
    expect(final).toHaveLength(1);
    expect(final[0].id).toBe(sessionId);
    expect(final[0].durationMs).toBeGreaterThanOrEqual(3_900);
    expect(final[0].durationMs).toBeLessThanOrEqual(4_100);
  });

  it('checkpoints when the tab becomes hidden', () => {
    renderHook(() => useReadingSession('article-a'));

    act(() => {
      now = 1_500;
      setVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
    });

    const sessions = readStudyData().readingSessions;
    expect(sessions).toHaveLength(1);
    expect(sessions[0].durationMs).toBeGreaterThanOrEqual(1_400);
    expect(sessions[0].durationMs).toBeLessThanOrEqual(1_600);
  });

  it('checkpoints periodically while the reader stays visible', () => {
    vi.useFakeTimers();
    renderHook(() => useReadingSession('article-a'));

    act(() => {
      now = 16_000;
      vi.advanceTimersByTime(15_000);
    });

    const sessions = readStudyData().readingSessions;
    expect(sessions).toHaveLength(1);
    expect(sessions[0].durationMs).toBeGreaterThanOrEqual(14_900);
  });

  it('does not write a session shorter than one second', () => {
    const { unmount } = renderHook(() => useReadingSession('article-a'));

    act(() => {
      now = 500;
    });
    unmount();

    expect(readStudyData().readingSessions).toHaveLength(0);
  });
});
