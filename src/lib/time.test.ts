import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, render, act } from '@testing-library/react';
import { createElement, useEffect } from 'react';
import { formatDuration, useVisibleDuration } from './time';

describe('formatDuration', () => {
  it('formats seconds only', () => {
    expect(formatDuration(45_000)).toBe('45 s');
  });

  it('formats minutes only', () => {
    expect(formatDuration(12 * 60_000)).toBe('12 min');
  });

  it('formats hours and minutes with zero padding', () => {
    expect(formatDuration(65 * 60_000)).toBe('1 h 05 min');
  });
});

describe('useVisibleDuration', () => {
  let now = 0;

  beforeEach(() => {
    now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    setVisibility('visible');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    setVisibility('visible');
  });

  function setVisibility(state: 'visible' | 'hidden') {
    Object.defineProperty(document, 'visibilityState', {
      value: state,
      writable: true,
    });
  }

  function dispatchVisibility(state: 'visible' | 'hidden') {
    act(() => {
      setVisibility(state);
      document.dispatchEvent(new Event('visibilitychange'));
    });
  }

  it('does not advance while hidden', () => {
    dispatchVisibility('hidden');
    const { result } = renderHook(() => useVisibleDuration(true));

    act(() => {
      now += 2000;
    });
    dispatchVisibility('hidden');

    expect(result.current.elapsedMs).toBe(0);
  });

  it('advances while visible', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useVisibleDuration(true, 100));

    act(() => {
      now += 2000;
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.elapsedMs).toBeGreaterThanOrEqual(1900);
    expect(result.current.elapsedMs).toBeLessThanOrEqual(2100);
  });

  it('pauses when visibility changes to hidden', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useVisibleDuration(true, 100));

    act(() => {
      now += 1000;
      vi.advanceTimersByTime(1000);
    });

    dispatchVisibility('hidden');

    act(() => {
      now += 1000;
      vi.advanceTimersByTime(1000);
    });

    dispatchVisibility('hidden');

    expect(result.current.elapsedMs).toBeGreaterThanOrEqual(900);
    expect(result.current.elapsedMs).toBeLessThanOrEqual(1100);
  });

  it('resumes when visibility returns to visible', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useVisibleDuration(true, 100));

    act(() => {
      now += 1000;
      vi.advanceTimersByTime(1000);
    });

    dispatchVisibility('hidden');

    act(() => {
      now += 1000;
      vi.advanceTimersByTime(1000);
    });

    dispatchVisibility('visible');

    act(() => {
      now += 1000;
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.elapsedMs).toBeGreaterThanOrEqual(1900);
    expect(result.current.elapsedMs).toBeLessThanOrEqual(2100);
  });

  it('exposes getElapsedMs that returns live accumulated time without tickMs', () => {
    setVisibility('visible');
    let recorded = 0;

    function TestComponent({ onUnmount }: { onUnmount: (ms: number) => void }) {
      const { getElapsedMs } = useVisibleDuration(true);
      useEffect(() => {
        return () => {
          onUnmount(getElapsedMs());
        };
      }, [getElapsedMs, onUnmount]);
      return null;
    }

    const { unmount } = render(
      createElement(TestComponent, { onUnmount: (ms: number) => { recorded = ms; } }),
    );

    act(() => {
      now += 2500;
    });

    unmount();

    expect(recorded).toBeGreaterThanOrEqual(2400);
    expect(recorded).toBeLessThanOrEqual(2600);
  });

  it('keeps the visible segment before hiding when no tickMs is set', () => {
    const { result } = renderHook(() => useVisibleDuration(true));

    act(() => {
      now += 2000;
    });
    dispatchVisibility('hidden');

    act(() => {
      now += 5000;
    });
    dispatchVisibility('visible');

    act(() => {
      now += 3000;
    });

    expect(result.current.getElapsedMs()).toBeGreaterThanOrEqual(4900);
    expect(result.current.getElapsedMs()).toBeLessThanOrEqual(5100);
  });

  it('starts counting when mounted hidden and the mode keeps counting', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setVisibility('hidden');

    const { result } = renderHook(() =>
      useVisibleDuration(true, 100, { pauseWhenHidden: false }),
    );

    act(() => {
      now += 2000;
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.elapsedMs).toBeGreaterThanOrEqual(1900);
    expect(result.current.elapsedMs).toBeLessThanOrEqual(2100);
  });

  it('re-renders at tickMs interval when provided', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const { result } = renderHook(() => useVisibleDuration(true, 100));

    act(() => {
      now += 250;
      vi.advanceTimersByTime(250);
    });

    expect(result.current.elapsedMs).toBeGreaterThanOrEqual(200);
  });
});
