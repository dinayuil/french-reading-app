import { useCallback, useEffect, useRef, useState } from 'react';

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours} h ${String(minutes).padStart(2, '0')} min`;
  }
  if (minutes > 0) {
    return `${minutes} min`;
  }
  return `${seconds} s`;
}

export interface VisibleDurationOptions {
  /**
   * Reading time pauses while the tab is hidden. Practice time must keep
   * counting, so it passes `false`.
   */
  pauseWhenHidden?: boolean;
  /**
   * Time already accumulated before this mount (for example a restored
   * practice draft). It is included in the first reported value.
   */
  initialElapsedMs?: number;
}

export function useVisibleDuration(
  active: boolean,
  tickMs?: number,
  options: VisibleDurationOptions = {},
): { elapsedMs: number; getElapsedMs: () => number } {
  const { pauseWhenHidden = true, initialElapsedMs = 0 } = options;
  const initial = Number.isFinite(initialElapsedMs)
    ? Math.max(0, initialElapsedMs)
    : 0;
  const [elapsedMs, setElapsedMs] = useState(initial);
  const startRef = useRef<number | null>(null);
  const accRef = useRef(initial);

  const getElapsedMs = useCallback(() => {
    if (startRef.current !== null) {
      const now = performance.now();
      accRef.current += now - startRef.current;
      startRef.current = now;
    }
    return accRef.current;
  }, []);

  useEffect(() => {
    if (!active) {
      // Freeze accumulated time and clear startRef so reactivation does not
      // count the inactive gap.
      if (startRef.current !== null) {
        const now = performance.now();
        accRef.current += now - startRef.current;
        startRef.current = null;
      }
      setElapsedMs(accRef.current);
      return;
    }

    const shouldRun = () =>
      !pauseWhenHidden || document.visibilityState === 'visible';

    const accumulate = () => {
      if (startRef.current !== null) {
        const now = performance.now();
        accRef.current += now - startRef.current;
        startRef.current = now;
      }
    };

    const startIfDue = () => {
      if (startRef.current === null && shouldRun()) {
        startRef.current = performance.now();
      }
    };

    const handleVisibilityChange = () => {
      if (shouldRun()) {
        // Restart on a tab that became visible, or keep a practice timer
        // running across the hidden period.
        startIfDue();
      } else {
        // Flush the visible segment before pausing, even without a tick.
        accumulate();
        startRef.current = null;
      }
      setElapsedMs(accRef.current);
    };

    startIfDue();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    let intervalId: number | undefined;
    if (tickMs && tickMs > 0) {
      intervalId = window.setInterval(() => {
        accumulate();
        setElapsedMs(accRef.current);
      }, tickMs);
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (intervalId !== undefined) {
        clearInterval(intervalId);
      }
      // Count the final segment regardless of visibility; a hide event may
      // not have fired before unmount.
      if (startRef.current !== null) {
        accRef.current += performance.now() - startRef.current;
        startRef.current = null;
      }
    };
  }, [active, tickMs, pauseWhenHidden]);

  return { elapsedMs, getElapsedMs };
}
