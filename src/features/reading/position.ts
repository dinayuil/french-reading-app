export interface ScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  viewportHeight: number;
}

export const READING_END_THRESHOLD_PX = 24;

function scrollRange(scrollHeight: number, viewportHeight: number): number {
  return Math.max(0, scrollHeight - viewportHeight);
}

export function readingPosition(metrics: ScrollMetrics): number {
  if (
    !Number.isFinite(metrics.scrollTop) ||
    !Number.isFinite(metrics.scrollHeight) ||
    !Number.isFinite(metrics.viewportHeight)
  ) {
    return 0;
  }
  const range = scrollRange(metrics.scrollHeight, metrics.viewportHeight);
  if (range === 0) return 0;
  return Math.min(1, Math.max(0, metrics.scrollTop / range));
}

export function isAtReadingEnd(metrics: ScrollMetrics): boolean {
  if (
    !Number.isFinite(metrics.scrollTop) ||
    !Number.isFinite(metrics.scrollHeight) ||
    !Number.isFinite(metrics.viewportHeight)
  ) {
    return false;
  }
  const range = scrollRange(metrics.scrollHeight, metrics.viewportHeight);
  if (range === 0) return false;
  return metrics.scrollTop >= range - READING_END_THRESHOLD_PX;
}

export function scrollTopForPosition(
  position: number,
  scrollHeight: number,
  viewportHeight: number,
): number {
  if (
    !Number.isFinite(position) ||
    !Number.isFinite(scrollHeight) ||
    !Number.isFinite(viewportHeight)
  ) {
    return 0;
  }
  const range = scrollRange(scrollHeight, viewportHeight);
  if (range === 0) return 0;
  const clamped = Math.min(1, Math.max(0, position));
  return Math.round(clamped * range);
}
