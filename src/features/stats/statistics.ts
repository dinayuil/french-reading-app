import type { StudyRecords } from '../data/studyData';

export interface LearningDayStatistics {
  date: string;
  completedArticles: number;
  readingMs: number;
  practiceMs: number;
  totalMs: number;
  practiceAttempts: number;
  correctAnswers: number;
  totalAnswers: number;
}

export interface LearningStatistics {
  today: LearningDayStatistics;
  /** Local calendar days in ascending order; the last bucket is today. */
  days: LearningDayStatistics[];
  /** Sum of daily unique article completions inside the window. */
  completedArticles: number;
  totalMs: number;
  readingMs: number;
  practiceMs: number;
  activeDays: number;
  practiceAttempts: number;
  correctAnswers: number;
  totalAnswers: number;
}

const DEFAULT_DAY_COUNT = 7;

/** Formats a Date as the local calendar day, independent of UTC offset. */
export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function emptyDay(date: string): LearningDayStatistics {
  return {
    date,
    completedArticles: 0,
    readingMs: 0,
    practiceMs: 0,
    totalMs: 0,
    practiceAttempts: 0,
    correctAnswers: 0,
    totalAnswers: 0,
  };
}

function localNoonWithOffset(base: Date, offset: number): Date {
  return new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate() + offset,
    12,
    0,
    0,
    0,
  );
}

/**
 * Derives learning statistics for the last `days` local calendar days,
 * including today. Reading time uses the day the session started; practice
 * time, attempts and answers use the submission day (completedDay), then the
 * local day of completedAt, then the started day for older records.
 * Future dates and records outside the window are ignored.
 */
export function getLearningStatistics(
  records: StudyRecords,
  now: Date = new Date(),
  days: number = DEFAULT_DAY_COUNT,
): LearningStatistics {
  const dayCount =
    Number.isInteger(days) && days > 0 ? days : DEFAULT_DAY_COUNT;
  const todayKey = localDateKey(now);
  const buckets: LearningDayStatistics[] = [];
  const byDate = new Map<string, LearningDayStatistics>();

  for (let offset = dayCount - 1; offset >= 0; offset -= 1) {
    const day = emptyDay(localDateKey(localNoonWithOffset(now, -offset)));
    buckets.push(day);
    byDate.set(day.date, day);
  }

  for (const session of records.readingSessions) {
    const day = byDate.get(localDateKey(new Date(session.startedAt)));
    if (!day) continue;
    day.readingMs += session.durationMs;
    day.totalMs += session.durationMs;
  }

  const completedByDay = new Map<string, Set<string>>();
  for (const session of records.practiceSessions) {
    const key =
      session.completedDay ??
      (session.completedAt !== undefined
        ? localDateKey(new Date(session.completedAt))
        : localDateKey(new Date(session.startedAt)));
    const day = byDate.get(key);
    if (!day) continue;

    day.practiceMs += session.durationMs;
    day.totalMs += session.durationMs;
    day.practiceAttempts += 1;
    for (const answer of session.answers) {
      day.totalAnswers += 1;
      if (answer.correct) day.correctAnswers += 1;
    }

    let completed = completedByDay.get(key);
    if (!completed) {
      completed = new Set<string>();
      completedByDay.set(key, completed);
    }
    completed.add(session.articleId);
  }

  for (const day of buckets) {
    day.completedArticles = completedByDay.get(day.date)?.size ?? 0;
  }

  let completedArticles = 0;
  let readingMs = 0;
  let practiceMs = 0;
  let totalMs = 0;
  let activeDays = 0;
  let practiceAttempts = 0;
  let correctAnswers = 0;
  let totalAnswers = 0;

  for (const day of buckets) {
    completedArticles += day.completedArticles;
    readingMs += day.readingMs;
    practiceMs += day.practiceMs;
    totalMs += day.totalMs;
    practiceAttempts += day.practiceAttempts;
    correctAnswers += day.correctAnswers;
    totalAnswers += day.totalAnswers;
    if (
      day.totalMs > 0 ||
      day.practiceAttempts > 0 ||
      day.completedArticles > 0
    ) {
      activeDays += 1;
    }
  }

  return {
    today: byDate.get(todayKey) ?? emptyDay(todayKey),
    days: buckets,
    completedArticles,
    totalMs,
    readingMs,
    practiceMs,
    activeDays,
    practiceAttempts,
    correctAnswers,
    totalAnswers,
  };
}
