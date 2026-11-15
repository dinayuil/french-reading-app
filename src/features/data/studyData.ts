import { readJSON, readRaw, writeJSONStrict } from '../../lib/storage';
import type {
  ArticleWordMark,
  PracticeAnswer,
  PracticeSession,
  ReadingProgress,
  ReadingSession,
  VocabularyEntry,
} from '../../types/progress';
import {
  mergeVocabularyLists,
  normalizeVocabularyEntry,
} from '../vocabulary/vocabulary';
import {
  isFiniteNonNegative,
  isIntegerNonNegative,
  isIsoDateString,
  isNonEmptyString,
  isRecord,
  isUnitInterval,
} from './validation';

export const STUDY_DATA_KEY = 'study-data';
export const PREVIOUS_BACKUP_KEY = 'previous-backup';
export const READING_SESSIONS_KEY = 'reading-sessions';
export const PRACTICE_SESSIONS_KEY = 'practice-sessions';

export type StoredReadingSession = ReadingSession & { id: string };
export type StoredPracticeSession = PracticeSession & { id: string };

export interface StudyRecords {
  readingSessions: StoredReadingSession[];
  practiceSessions: StoredPracticeSession[];
  readingProgress: ReadingProgress[];
  /** Optional for callers and fixtures written before vocabulary existed. */
  vocabulary?: VocabularyEntry[];
  /** Optional for callers and fixtures written before shared article marks. */
  articleMarks?: ArticleWordMark[];
}

const LOCAL_DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Accepts only a real local calendar day in YYYY-MM-DD form. */
export function isLocalDateKeyString(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = LOCAL_DAY_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function stableJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '';
  }
}

function legacyId(prefix: 'reading' | 'practice', index: number, value: unknown): string {
  return `${prefix}-legacy-${index.toString(36)}-${hashString(stableJson(value))}`;
}

export function createRecordId(prefix: 'reading' | 'practice'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

function normalizeAnswer(value: unknown): PracticeAnswer | null {
  if (!isRecord(value)) return null;
  if (!isNonEmptyString(value.questionId)) return null;
  if (value.selectedIndex !== null && !isIntegerNonNegative(value.selectedIndex)) {
    return null;
  }
  if (typeof value.correct !== 'boolean') return null;
  return {
    questionId: value.questionId,
    selectedIndex: value.selectedIndex as number | null,
    correct: value.correct,
  };
}

export function normalizeReadingSession(
  value: unknown,
  fallbackId?: string,
): StoredReadingSession | null {
  if (!isRecord(value)) return null;
  if (!isNonEmptyString(value.articleId)) return null;
  if (!isIsoDateString(value.startedAt)) return null;
  if (!isFiniteNonNegative(value.durationMs)) return null;
  const id = isNonEmptyString(value.id) ? value.id : fallbackId;
  if (!id) return null;
  return {
    id,
    articleId: value.articleId,
    startedAt: value.startedAt,
    durationMs: value.durationMs,
  };
}

export function normalizePracticeSession(
  value: unknown,
  fallbackId?: string,
): StoredPracticeSession | null {
  if (!isRecord(value)) return null;
  if (!isNonEmptyString(value.articleId)) return null;
  if (!isIsoDateString(value.startedAt)) return null;
  if (!isFiniteNonNegative(value.durationMs)) return null;
  if (!isIntegerNonNegative(value.score) || !isIntegerNonNegative(value.total)) {
    return null;
  }
  if (value.score > value.total) return null;
  if (!Array.isArray(value.answers)) return null;
  const answers: PracticeAnswer[] = [];
  for (const rawAnswer of value.answers) {
    const answer = normalizeAnswer(rawAnswer);
    if (!answer) return null;
    answers.push(answer);
  }
  if (
    !Array.isArray(value.markedWords) ||
    !value.markedWords.every((word) => typeof word === 'string')
  ) {
    return null;
  }
  if (
    value.completedAt !== undefined &&
    !isIsoDateString(value.completedAt)
  ) {
    return null;
  }
  if (
    value.completedDay !== undefined &&
    !isLocalDateKeyString(value.completedDay)
  ) {
    return null;
  }
  const id = isNonEmptyString(value.id) ? value.id : fallbackId;
  if (!id) return null;
  const session: StoredPracticeSession = {
    id,
    articleId: value.articleId,
    startedAt: value.startedAt,
    durationMs: value.durationMs,
    score: value.score,
    total: value.total,
    answers,
    markedWords: value.markedWords,
  };
  if (value.completedAt !== undefined) {
    session.completedAt = value.completedAt;
  }
  if (value.completedDay !== undefined) {
    session.completedDay = value.completedDay;
  }
  return session;
}

export function normalizeReadingProgress(value: unknown): ReadingProgress | null {
  if (!isRecord(value)) return null;
  if (!isNonEmptyString(value.articleId)) return null;
  if (!isUnitInterval(value.position)) return null;
  if (typeof value.completed !== 'boolean') return null;
  if (!isIsoDateString(value.updatedAt)) return null;
  return {
    articleId: value.articleId,
    position: value.position,
    completed: value.completed,
    updatedAt: value.updatedAt,
  };
}

function normalizeReadingList(value: unknown): StoredReadingSession[] {
  if (!Array.isArray(value)) return [];
  const sessions: StoredReadingSession[] = [];
  value.forEach((raw, index) => {
    const session = normalizeReadingSession(
      raw,
      legacyId('reading', index, raw),
    );
    if (session) sessions.push(session);
  });
  return sessions;
}

function normalizePracticeList(value: unknown): StoredPracticeSession[] {
  if (!Array.isArray(value)) return [];
  const sessions: StoredPracticeSession[] = [];
  value.forEach((raw, index) => {
    const session = normalizePracticeSession(
      raw,
      legacyId('practice', index, raw),
    );
    if (session) sessions.push(session);
  });
  return sessions;
}

function normalizeVocabularyList(value: unknown): VocabularyEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: VocabularyEntry[] = [];
  for (const raw of value) {
    const entry = normalizeVocabularyEntry(raw);
    if (entry) entries.push(entry);
  }
  return mergeVocabularyLists(entries);
}

function normalizeArticleMarkList(value: unknown): ArticleWordMark[] {
  if (!Array.isArray(value)) return [];
  const marks: ArticleWordMark[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    if (!isNonEmptyString(raw.id)) continue;
    if (!isNonEmptyString(raw.articleId)) continue;
    if (!isNonEmptyString(raw.term)) continue;
    if (!isIsoDateString(raw.updatedAt)) continue;
    if (raw.deletedAt !== undefined && !isIsoDateString(raw.deletedAt)) {
      continue;
    }
    const mark: ArticleWordMark = {
      id: raw.id,
      articleId: raw.articleId.trim(),
      term: raw.term.trim(),
      updatedAt: raw.updatedAt,
    };
    if (raw.deletedAt !== undefined) mark.deletedAt = raw.deletedAt;
    marks.push(mark);
  }
  return marks;
}

function normalizeProgressList(value: unknown): ReadingProgress[] {
  if (!Array.isArray(value)) return [];
  const byArticle = new Map<string, ReadingProgress>();
  for (const raw of value) {
    const progress = normalizeReadingProgress(raw);
    if (!progress) continue;
    const existing = byArticle.get(progress.articleId);
    if (
      !existing ||
      Date.parse(progress.updatedAt) >= Date.parse(existing.updatedAt)
    ) {
      byArticle.set(progress.articleId, progress);
    }
  }
  return [...byArticle.values()];
}

function readCanonical(): StudyRecords | null {
  const raw = readRaw(STUDY_DATA_KEY);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    if (
      !Array.isArray(parsed.readingSessions) ||
      !Array.isArray(parsed.practiceSessions)
    ) {
      return null;
    }
    if (
      parsed.readingProgress !== undefined &&
      !Array.isArray(parsed.readingProgress)
    ) {
      return null;
    }
    return {
      readingSessions: normalizeReadingList(parsed.readingSessions),
      practiceSessions: normalizePracticeList(parsed.practiceSessions),
      readingProgress: normalizeProgressList(parsed.readingProgress ?? []),
      vocabulary: normalizeVocabularyList(parsed.vocabulary),
      articleMarks: normalizeArticleMarkList(parsed.articleMarks),
    };
  } catch {
    return null;
  }
}

function readLegacy(): StudyRecords {
  return {
    readingSessions: normalizeReadingList(
      readJSON<unknown>(READING_SESSIONS_KEY, []),
    ),
    practiceSessions: normalizePracticeList(
      readJSON<unknown>(PRACTICE_SESSIONS_KEY, []),
    ),
    readingProgress: [],
    vocabulary: [],
    articleMarks: [],
  };
}

/**
 * Reads learning records without writing. The canonical document wins once it
 * exists; raw pre-sync keys are only used until the first canonical write.
 */
export function readStudyRecords(): StudyRecords {
  return readCanonical() ?? readLegacy();
}

/** Atomically writes all learning records to one storage key. */
export function writeStudyRecords(records: StudyRecords): void {
  writeJSONStrict(STUDY_DATA_KEY, {
    readingSessions: records.readingSessions,
    practiceSessions: records.practiceSessions,
    readingProgress: records.readingProgress,
    vocabulary: records.vocabulary ?? [],
    articleMarks: records.articleMarks ?? [],
  });
}

function upsertById<T extends { id: string }>(items: T[], item: T): T[] {
  const index = items.findIndex((candidate) => candidate.id === item.id);
  if (index === -1) return [...items, item];
  const next = items.slice();
  next[index] = item;
  return next;
}

export function saveReadingSession(session: ReadingSession): void {
  const normalized = normalizeReadingSession(session);
  if (!normalized) {
    throw new Error('Invalid reading session record.');
  }
  const records = readStudyRecords();
  writeStudyRecords({
    ...records,
    readingSessions: upsertById(records.readingSessions, normalized),
  });
}

export function savePracticeSession(session: PracticeSession): void {
  const normalized = normalizePracticeSession(session);
  if (!normalized) {
    throw new Error('Invalid practice session record.');
  }
  const records = readStudyRecords();
  writeStudyRecords({
    ...records,
    practiceSessions: upsertById(records.practiceSessions, normalized),
  });
}

export function saveReadingProgress(progress: ReadingProgress): void {
  const normalized = normalizeReadingProgress(progress);
  if (!normalized) {
    throw new Error('Invalid reading progress record.');
  }
  const records = readStudyRecords();
  const index = records.readingProgress.findIndex(
    (candidate) => candidate.articleId === normalized.articleId,
  );
  if (index !== -1) {
    const existing = records.readingProgress[index];
    if (Date.parse(existing.updatedAt) > Date.parse(normalized.updatedAt)) {
      return;
    }
    const readingProgress = records.readingProgress.slice();
    readingProgress[index] = normalized;
    writeStudyRecords({ ...records, readingProgress });
    return;
  }
  writeStudyRecords({
    ...records,
    readingProgress: [...records.readingProgress, normalized],
  });
}

export function getReadingProgress(
  articleId: string,
): ReadingProgress | null {
  return (
    readStudyRecords().readingProgress.find(
      (progress) => progress.articleId === articleId,
    ) ?? null
  );
}
