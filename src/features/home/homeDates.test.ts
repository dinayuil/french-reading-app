import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addLocalDays,
  getLocalToday,
  selectDaysInRange,
  sortDayKeys,
  toLocalDateKey,
} from './homeDates';

describe('toLocalDateKey', () => {
  it('formats the local calendar date without shifting through UTC', () => {
    expect(toLocalDateKey(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01');
    expect(toLocalDateKey(new Date(2026, 11, 31, 23, 30))).toBe('2026-12-31');
  });
});

describe('addLocalDays', () => {
  it('crosses month and year boundaries on the local calendar', () => {
    expect(addLocalDays('2026-01-02', -6)).toBe('2025-12-27');
    expect(addLocalDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('handles leap days', () => {
    expect(addLocalDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(addLocalDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addLocalDays('2024-02-29', 1)).toBe('2024-03-01');
  });
});

describe('getLocalToday', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the local date, not the UTC date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 12, 23, 55));

    expect(getLocalToday()).toBe('2026-11-12');
  });
});

describe('selectDaysInRange', () => {
  const days = [
    '2026-11-13',
    '2026-11-12',
    '2026-11-11',
    '2026-11-10',
    '2026-11-09',
    '2026-11-06',
    '2026-10-14',
    '2026-10-13',
    '2026-13-01',
    'not-a-date',
    '2026-11-12',
  ];

  it('includes today and removes future or out-of-range dates', () => {
    expect(selectDaysInRange(days, 3, '2026-11-12')).toEqual([
      '2026-11-12',
      '2026-11-11',
      '2026-11-10',
    ]);
    expect(selectDaysInRange(days, 7, '2026-11-12')).toEqual([
      '2026-11-12',
      '2026-11-11',
      '2026-11-10',
      '2026-11-09',
      '2026-11-06',
    ]);
    expect(selectDaysInRange(days, 30, '2026-11-12')).toEqual([
      '2026-11-12',
      '2026-11-11',
      '2026-11-10',
      '2026-11-09',
      '2026-11-06',
      '2026-10-14',
    ]);
  });

  it('crosses a month and a year boundary', () => {
    const boundaryDays = [
      '2026-01-03',
      '2026-01-02',
      '2026-01-01',
      '2025-12-31',
      '2025-12-27',
      '2025-12-26',
    ];

    expect(selectDaysInRange(boundaryDays, 7, '2026-01-02')).toEqual([
      '2026-01-02',
      '2026-01-01',
      '2025-12-31',
      '2025-12-27',
    ]);
  });

  it('includes leap day in a three-day window', () => {
    const leapDays = [
      '2024-03-01',
      '2024-02-29',
      '2024-02-28',
      '2024-02-27',
    ];

    expect(selectDaysInRange(leapDays, 3, '2024-03-01')).toEqual([
      '2024-03-01',
      '2024-02-29',
      '2024-02-28',
    ]);
    expect(selectDaysInRange(leapDays, 3, '2024-02-29')).toEqual([
      '2024-02-29',
      '2024-02-28',
      '2024-02-27',
    ]);
  });

  it('ignores invalid and duplicate day keys', () => {
    expect(
      selectDaysInRange(
        ['2026-03-01', '2026-02-29', '2026-02-28', '2026-02-28'],
        3,
        '2026-03-01',
      ),
    ).toEqual(['2026-03-01', '2026-02-28']);
  });
});

describe('sortDayKeys', () => {
  it('sorts newest first or oldest first without mutating the input', () => {
    const days = ['2026-11-10', '2026-12-01', '2026-11-30'];

    expect(sortDayKeys(days, 'newest')).toEqual([
      '2026-12-01',
      '2026-11-30',
      '2026-11-10',
    ]);
    expect(sortDayKeys(days, 'oldest')).toEqual([
      '2026-11-10',
      '2026-11-30',
      '2026-12-01',
    ]);
    expect(days).toEqual(['2026-11-10', '2026-12-01', '2026-11-30']);
  });
});
