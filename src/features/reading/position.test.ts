import { describe, expect, it } from 'vitest';
import {
  isAtReadingEnd,
  readingPosition,
  scrollTopForPosition,
} from './position';

describe('reading position', () => {
  it('maps scroll offsets to a 0..1 progress value', () => {
    expect(
      readingPosition({ scrollTop: 0, scrollHeight: 2_000, viewportHeight: 1_000 }),
    ).toBe(0);
    expect(
      readingPosition({
        scrollTop: 500,
        scrollHeight: 2_000,
        viewportHeight: 1_000,
      }),
    ).toBe(0.5);
    expect(
      readingPosition({
        scrollTop: 1_000,
        scrollHeight: 2_000,
        viewportHeight: 1_000,
      }),
    ).toBe(1);
    expect(
      readingPosition({
        scrollTop: 1_500,
        scrollHeight: 2_000,
        viewportHeight: 1_000,
      }),
    ).toBe(1);
  });

  it('does not divide by zero when the article fits the viewport', () => {
    expect(
      readingPosition({ scrollTop: 0, scrollHeight: 500, viewportHeight: 1_000 }),
    ).toBe(0);
    expect(
      isAtReadingEnd({ scrollTop: 0, scrollHeight: 500, viewportHeight: 1_000 }),
    ).toBe(false);
  });

  it('marks the end only near the bottom of a scrollable article', () => {
    expect(
      isAtReadingEnd({
        scrollTop: 900,
        scrollHeight: 2_000,
        viewportHeight: 1_000,
      }),
    ).toBe(false);
    expect(
      isAtReadingEnd({
        scrollTop: 990,
        scrollHeight: 2_000,
        viewportHeight: 1_000,
      }),
    ).toBe(true);
    expect(
      isAtReadingEnd({
        scrollTop: 1_000,
        scrollHeight: 2_000,
        viewportHeight: 1_000,
      }),
    ).toBe(true);
  });

  it('converts a saved position back to a scroll offset', () => {
    expect(scrollTopForPosition(0.5, 2_000, 1_000)).toBe(500);
    expect(scrollTopForPosition(2, 2_000, 1_000)).toBe(1_000);
    expect(scrollTopForPosition(-1, 2_000, 1_000)).toBe(0);
    expect(scrollTopForPosition(0.5, 500, 1_000)).toBe(0);
  });
});
