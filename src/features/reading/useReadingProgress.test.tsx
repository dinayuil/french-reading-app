import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useReadingProgress } from './useReadingProgress';
import {
  getReadingProgress,
  saveReadingProgress,
} from '../data/studyData';

const STORED_TIME = '2026-11-01T10:00:00.000Z';

function setMetrics(options: {
  scrollY: number;
  scrollHeight: number;
  viewportHeight: number;
}): void {
  Object.defineProperty(window, 'scrollY', {
    value: options.scrollY,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(window, 'innerHeight', {
    value: options.viewportHeight,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    value: options.scrollHeight,
    writable: true,
    configurable: true,
  });
}

function clearMetrics(): void {
  Reflect.deleteProperty(window, 'scrollY');
  Reflect.deleteProperty(window, 'innerHeight');
  Reflect.deleteProperty(document.documentElement, 'scrollHeight');
}

describe('useReadingProgress', () => {
  beforeEach(() => {
    localStorage.clear();
    setMetrics({ scrollY: 0, scrollHeight: 2_000, viewportHeight: 1_000 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearMetrics();
    localStorage.clear();
  });

  it('restores the last position when it is incomplete', async () => {
    saveReadingProgress({
      articleId: 'article-a',
      position: 0.5,
      completed: false,
      updatedAt: STORED_TIME,
    });
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    renderHook(() => useReadingProgress('article-a'));

    await waitFor(() => {
      expect(scrollTo).toHaveBeenCalledWith(0, 500);
    });
  });

  it('does not restore an article that was already completed', async () => {
    saveReadingProgress({
      articleId: 'article-a',
      position: 1,
      completed: true,
      updatedAt: STORED_TIME,
    });
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    renderHook(() => useReadingProgress('article-a'));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('records the position after scrolling', async () => {
    renderHook(() => useReadingProgress('article-a'));

    act(() => {
      Object.defineProperty(window, 'scrollY', {
        value: 500,
        writable: true,
        configurable: true,
      });
      window.dispatchEvent(new Event('scroll'));
    });

    await waitFor(() => {
      expect(getReadingProgress('article-a')).toMatchObject({
        position: 0.5,
        completed: false,
      });
    });
  });

  it('marks the article completed at the bottom and keeps that state', async () => {
    renderHook(() => useReadingProgress('article-a'));

    act(() => {
      Object.defineProperty(window, 'scrollY', {
        value: 1_000,
        writable: true,
        configurable: true,
      });
      window.dispatchEvent(new Event('scroll'));
    });

    await waitFor(() => {
      expect(getReadingProgress('article-a')).toMatchObject({
        position: 1,
        completed: true,
      });
    });

    act(() => {
      Object.defineProperty(window, 'scrollY', {
        value: 200,
        writable: true,
        configurable: true,
      });
      window.dispatchEvent(new Event('scroll'));
    });

    await waitFor(() => {
      expect(getReadingProgress('article-a')).toMatchObject({
        position: 0.2,
        completed: true,
      });
    });
  });

  it('flushes on pagehide even before the scroll throttle fires', async () => {
    renderHook(() => useReadingProgress('article-a'));

    act(() => {
      Object.defineProperty(window, 'scrollY', {
        value: 500,
        writable: true,
        configurable: true,
      });
      window.dispatchEvent(new Event('pagehide'));
    });

    await waitFor(() => {
      expect(getReadingProgress('article-a')?.position).toBe(0.5);
    });
  });

  it('does not create a progress record when the article was never scrolled', () => {
    const { unmount } = renderHook(() => useReadingProgress('article-a'));
    unmount();

    expect(getReadingProgress('article-a')).toBeNull();
  });

  it('does not overwrite a newer progress record with an older one', () => {
    saveReadingProgress({
      articleId: 'article-a',
      position: 0.8,
      completed: false,
      updatedAt: '2026-11-12T10:00:00.000Z',
    });

    saveReadingProgress({
      articleId: 'article-a',
      position: 0.2,
      completed: false,
      updatedAt: STORED_TIME,
    });

    expect(getReadingProgress('article-a')?.position).toBe(0.8);
  });

  it('keeps the last valid reading metrics when cleanup runs after the route DOM is gone', async () => {
    const { unmount } = renderHook(() => useReadingProgress('article-a'));

    act(() => {
      Object.defineProperty(window, 'scrollY', {
        value: 500,
        writable: true,
        configurable: true,
      });
      window.dispatchEvent(new Event('scroll'));
    });

    await waitFor(() => {
      expect(getReadingProgress('article-a')?.position).toBe(0.5);
    });

    setMetrics({ scrollY: 0, scrollHeight: 0, viewportHeight: 0 });
    unmount();

    expect(getReadingProgress('article-a')).toMatchObject({
      position: 0.5,
      completed: false,
    });
  });

  it('does not write zero when StrictMode restarts before restoring an existing position', async () => {
    saveReadingProgress({
      articleId: 'article-a',
      position: 0.5,
      completed: false,
      updatedAt: STORED_TIME,
    });
    setMetrics({ scrollY: 0, scrollHeight: 2_000, viewportHeight: 1_000 });
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    const { unmount } = renderHook(() => useReadingProgress('article-a'), {
      wrapper: ({ children }) => <StrictMode>{children}</StrictMode>,
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(scrollTo).toHaveBeenCalledWith(0, 500);
    expect(getReadingProgress('article-a')).toMatchObject({
      position: 0.5,
      completed: false,
      updatedAt: STORED_TIME,
    });

    unmount();
    expect(getReadingProgress('article-a')?.updatedAt).toBe(STORED_TIME);
  });
});
