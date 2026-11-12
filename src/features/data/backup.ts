import { loadSettings, writeSettingsStrict } from '../../lib/settings';
import { readRaw, removeRaw, writeJSONStrict, writeRaw } from '../../lib/storage';
import type { ReadingProgress, Settings } from '../../types/progress';
import {
  PREVIOUS_BACKUP_KEY,
  STUDY_DATA_KEY,
  normalizePracticeSession,
  normalizeReadingProgress,
  normalizeReadingSession,
  readStudyRecords,
  writeStudyRecords,
} from './studyData';
import type {
  StoredPracticeSession,
  StoredReadingSession,
} from './studyData';
import {
  isIsoDateString,
  isRecord,
} from './validation';

export const STUDY_BACKUP_FORMAT = 'frp-study-backup';
export const STUDY_BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;

export interface StudyData {
  readingSessions: StoredReadingSession[];
  practiceSessions: StoredPracticeSession[];
  readingProgress: ReadingProgress[];
  settings: Settings;
}

export interface StudyBackup {
  format: typeof STUDY_BACKUP_FORMAT;
  version: typeof STUDY_BACKUP_VERSION;
  exportedAt: string;
  data: StudyData;
}

function utf8ByteLength(value: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value).length;
  }
  return new Blob([value]).size;
}

function safeStringify(value: unknown): string | null {
  try {
    const text = JSON.stringify(value);
    return typeof text === 'string' ? text : null;
  } catch {
    return null;
  }
}

function sameAnswers(
  left: StoredPracticeSession['answers'],
  right: StoredPracticeSession['answers'],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((answer, index) => {
    const other = right[index];
    return (
      answer.questionId === other.questionId &&
      answer.selectedIndex === other.selectedIndex &&
      answer.correct === other.correct
    );
  });
}

function mergeReadingRecords(
  left: StoredReadingSession,
  right: StoredReadingSession,
): StoredReadingSession {
  if (left.articleId !== right.articleId || left.startedAt !== right.startedAt) {
    throw new Error('Inconsistent backup reading session records.');
  }
  return left.durationMs >= right.durationMs ? left : right;
}

function mergePracticeRecords(
  left: StoredPracticeSession,
  right: StoredPracticeSession,
): StoredPracticeSession {
  if (
    left.articleId !== right.articleId ||
    left.startedAt !== right.startedAt ||
    left.durationMs !== right.durationMs ||
    left.score !== right.score ||
    left.total !== right.total ||
    !sameAnswers(left.answers, right.answers)
  ) {
    throw new Error('Inconsistent backup practice session records.');
  }
  const markedWords = [...new Set([...left.markedWords, ...right.markedWords])];
  return { ...left, markedWords };
}

function compareIds(left: { id: string }, right: { id: string }): number {
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
}

function parseSettings(value: unknown): Settings {
  if (!isRecord(value)) {
    throw new Error('Invalid backup settings.');
  }
  if (value.uiLanguage !== 'fr' && value.uiLanguage !== 'zh') {
    throw new Error('Invalid backup settings.');
  }
  if (
    typeof value.onboardingSeen !== 'boolean' ||
    typeof value.practiceTimerVisible !== 'boolean'
  ) {
    throw new Error('Invalid backup settings.');
  }
  return {
    uiLanguage: value.uiLanguage,
    onboardingSeen: value.onboardingSeen,
    practiceTimerVisible: value.practiceTimerVisible,
  };
}

function parseData(value: unknown): StudyData {
  if (!isRecord(value)) {
    throw new Error('Invalid backup data.');
  }
  if (
    !Array.isArray(value.readingSessions) ||
    !Array.isArray(value.practiceSessions) ||
    !Array.isArray(value.readingProgress)
  ) {
    throw new Error('Invalid backup data.');
  }

  const readingById = new Map<string, StoredReadingSession>();
  for (const raw of value.readingSessions) {
    const session = normalizeReadingSession(raw);
    if (!session) {
      throw new Error('Invalid backup reading session.');
    }
    const existing = readingById.get(session.id);
    readingById.set(
      session.id,
      existing ? mergeReadingRecords(existing, session) : session,
    );
  }

  const practiceById = new Map<string, StoredPracticeSession>();
  for (const raw of value.practiceSessions) {
    const session = normalizePracticeSession(raw);
    if (!session) {
      throw new Error('Invalid backup practice session.');
    }
    const existing = practiceById.get(session.id);
    practiceById.set(
      session.id,
      existing ? mergePracticeRecords(existing, session) : session,
    );
  }

  const progressByArticle = new Map<string, ReadingProgress>();
  for (const raw of value.readingProgress) {
    const progress = normalizeReadingProgress(raw);
    if (!progress) {
      throw new Error('Invalid backup reading progress.');
    }
    const existing = progressByArticle.get(progress.articleId);
    if (
      !existing ||
      Date.parse(progress.updatedAt) >= Date.parse(existing.updatedAt)
    ) {
      progressByArticle.set(progress.articleId, progress);
    }
  }

  return {
    readingSessions: [...readingById.values()],
    practiceSessions: [...practiceById.values()],
    readingProgress: [...progressByArticle.values()],
    settings: parseSettings(value.settings),
  };
}

export function readStudyData(): StudyData {
  return {
    ...readStudyRecords(),
    settings: loadSettings(),
  };
}

/** Pure synchronous read of the current learning data. */
export function createBackup(): StudyBackup {
  return {
    format: STUDY_BACKUP_FORMAT,
    version: STUDY_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: readStudyData(),
  };
}

export function parseBackup(input: string | unknown): StudyBackup {
  const text = typeof input === 'string' ? input : safeStringify(input);
  if (text === null) {
    throw new Error('Backup must be a JSON object.');
  }
  if (utf8ByteLength(text) > MAX_BACKUP_BYTES) {
    throw new Error('Backup exceeds the 10 MiB limit.');
  }

  let value: unknown = input;
  if (typeof input === 'string') {
    try {
      value = JSON.parse(input);
    } catch {
      throw new Error('Backup is not valid JSON.');
    }
  }

  if (!isRecord(value)) {
    throw new Error('Backup must be a JSON object.');
  }
  if (value.format !== STUDY_BACKUP_FORMAT) {
    throw new Error('Unsupported backup format.');
  }
  if (value.version !== STUDY_BACKUP_VERSION) {
    throw new Error('Unsupported backup version.');
  }
  if (!isIsoDateString(value.exportedAt)) {
    throw new Error('Invalid backup export date.');
  }

  return {
    format: STUDY_BACKUP_FORMAT,
    version: STUDY_BACKUP_VERSION,
    exportedAt: value.exportedAt,
    data: parseData(value.data),
  };
}

function mergeProgress(
  local: ReadingProgress[],
  remote: ReadingProgress[],
): ReadingProgress[] {
  const byArticle = new Map(local.map((item) => [item.articleId, item]));
  for (const item of remote) {
    const existing = byArticle.get(item.articleId);
    if (
      !existing ||
      Date.parse(item.updatedAt) > Date.parse(existing.updatedAt)
    ) {
      byArticle.set(item.articleId, item);
    }
  }
  return [...byArticle.values()].sort((left, right) =>
    left.articleId < right.articleId
      ? -1
      : left.articleId > right.articleId
        ? 1
        : 0,
  );
}

function mergeData(local: StudyData, remote: StudyData): StudyData {
  const readingById = new Map(
    local.readingSessions.map((item) => [item.id, item]),
  );
  for (const item of remote.readingSessions) {
    const existing = readingById.get(item.id);
    readingById.set(
      item.id,
      existing ? mergeReadingRecords(existing, item) : item,
    );
  }

  const practiceById = new Map(
    local.practiceSessions.map((item) => [item.id, item]),
  );
  for (const item of remote.practiceSessions) {
    const existing = practiceById.get(item.id);
    practiceById.set(
      item.id,
      existing ? mergePracticeRecords(existing, item) : item,
    );
  }

  return {
    readingSessions: [...readingById.values()].sort(compareIds),
    practiceSessions: [...practiceById.values()].sort(compareIds),
    readingProgress: mergeProgress(local.readingProgress, remote.readingProgress),
    settings: { ...local.settings },
  };
}

export function mergeBackups(
  local: StudyBackup,
  remote: StudyBackup,
): StudyBackup {
  const localBackup = parseBackup(local);
  const remoteBackup = parseBackup(remote);
  return {
    format: STUDY_BACKUP_FORMAT,
    version: STUDY_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: mergeData(localBackup.data, remoteBackup.data),
  };
}

function snapshotSettingsRaw(): string | null {
  return readRaw('settings');
}

function rollbackValue(key: string, value: string | null): void {
  try {
    if (value === null) {
      removeRaw(key);
    } else {
      writeRaw(key, value);
    }
  } catch {
    // The original error is more useful than a rollback write error.
  }
}

function replaceStudyData(
  parsed: StudyBackup,
  snapshotPrevious: boolean,
): void {
  const previousDataRaw = readRaw(STUDY_DATA_KEY);
  const previousSettingsRaw = snapshotSettingsRaw();

  if (snapshotPrevious) {
    const current = readStudyData();
    const previous: StudyBackup = {
      format: STUDY_BACKUP_FORMAT,
      version: STUDY_BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      data: current,
    };
    writeJSONStrict(PREVIOUS_BACKUP_KEY, previous);
  }

  try {
    writeStudyRecords(parsed.data);
    writeSettingsStrict(parsed.data.settings);
  } catch (error) {
    rollbackValue(STUDY_DATA_KEY, previousDataRaw);
    rollbackValue('settings', previousSettingsRaw);
    throw error;
  }
}

export function applyBackup(
  backup: StudyBackup,
  mode: 'merge' | 'replace',
): void {
  const parsed = parseBackup(backup);

  if (mode === 'merge') {
    const current = readStudyData();
    const merged = mergeData(current, parsed.data);
    writeStudyRecords(merged);
    return;
  }

  replaceStudyData(parsed, true);
}

export function restorePreviousBackup(): void {
  const raw = readRaw(PREVIOUS_BACKUP_KEY);
  if (raw === null) {
    throw new Error('No previous backup is available.');
  }
  const previous = parseBackup(raw);
  replaceStudyData(previous, false);
  removeRaw(PREVIOUS_BACKUP_KEY);
}

/**
 * Whether the recovery slot currently holds a valid, restorable backup. It is
 * read-only: an invalid file stays untouched for manual inspection.
 */
export function hasPreviousBackup(): boolean {
  const raw = readRaw(PREVIOUS_BACKUP_KEY);
  if (raw === null) return false;
  try {
    parseBackup(raw);
    return true;
  } catch {
    return false;
  }
}

export function getStudySummary(data: StudyData): {
  readingMs: number;
  practiceMs: number;
  readingArticles: number;
  practiceAttempts: number;
  correctAnswers: number;
  totalAnswers: number;
} {
  let readingMs = 0;
  const articles = new Set<string>();
  for (const session of data.readingSessions) {
    readingMs += session.durationMs;
    articles.add(session.articleId);
  }

  let practiceMs = 0;
  let correctAnswers = 0;
  let totalAnswers = 0;
  for (const session of data.practiceSessions) {
    practiceMs += session.durationMs;
    for (const answer of session.answers) {
      totalAnswers += 1;
      if (answer.correct) correctAnswers += 1;
    }
  }

  return {
    readingMs,
    practiceMs,
    readingArticles: articles.size,
    practiceAttempts: data.practiceSessions.length,
    correctAnswers,
    totalAnswers,
  };
}
