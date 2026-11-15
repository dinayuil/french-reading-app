import { describe, expect, it } from 'vitest';
import { buildShareCardModel, type ShareCardStats } from './shareCard';
import type { TFunction } from 'i18next';

const t = ((key: string, options?: Record<string, unknown>) => {
  if (options && typeof options.count === 'number') {
    return `${key}:${options.count}`;
  }
  if (options && options.hours !== undefined) {
    return `${key}:${String(options.hours)}`;
  }
  if (options && typeof options.goal === 'number') {
    return `${key}:${options.goal}`;
  }
  return key;
}) as unknown as TFunction;

const stats: ShareCardStats = {
  today: { date: '2026-11-15', completedArticles: 2, totalMs: 3_600_000 },
  days: [
    { date: '2026-11-09', completedArticles: 0, totalMs: 0 },
    { date: '2026-11-10', completedArticles: 3, totalMs: 7_200_000 },
    { date: '2026-11-11', completedArticles: 1, totalMs: 1_800_000 },
    { date: '2026-11-12', completedArticles: 0, totalMs: 600_000 },
    { date: '2026-11-13', completedArticles: 2, totalMs: 3_000_000 },
    { date: '2026-11-14', completedArticles: 1, totalMs: 900_000 },
    { date: '2026-11-15', completedArticles: 2, totalMs: 3_600_000 },
  ],
};

describe('buildShareCardModel', () => {
  it('keeps today and the seven latest days as the primary and secondary data', () => {
    const model = buildShareCardModel(
      stats,
      4,
      'fr',
      t,
      new Date('2026-11-15T12:00:00'),
    );

    expect(model.todayCount).toBe(2);
    expect(model.goal).toBe(4);
    expect(model.todayTime).toBe('data.duration.hours:1');
    expect(model.weekBars).toHaveLength(7);
    expect(model.weekBars[0]).toMatchObject({
      date: '2026-11-09',
      count: 0,
      ratio: 0,
    });
    expect(
      model.weekBars.find((bar) => bar.date === '2026-11-10')?.ratio,
    ).toBe(1);
    expect(model.weekTotal).toBe('data.duration.hoursMinutes:4');
    expect(model.dateLabel).toContain('2026');
  });

  it('clamps the goal to the supported range', () => {
    expect(buildShareCardModel(stats, 0, 'fr', t).goal).toBe(1);
    expect(buildShareCardModel(stats, 30, 'fr', t).goal).toBe(20);
  });

  it('uses localized weekday labels for the Chinese card', () => {
    const model = buildShareCardModel(
      stats,
      3,
      'zh',
      t,
      new Date('2026-11-15T12:00:00'),
    );
    expect(model.weekBars).toHaveLength(7);
    expect(model.weekBars[0].weekday).toBeTruthy();
    expect(model.todayLabel).toBe('share.today');
  });
});
