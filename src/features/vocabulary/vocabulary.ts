import { readStudyRecords, writeStudyRecords } from '../data/studyData';
import {
  isIsoDateString,
  isNonEmptyString,
  isRecord,
} from '../data/validation';
import type { VocabularyEntry } from '../../types/progress';

// Re-exported so feature consumers can import the entry shape with the API.
export type { VocabularyEntry };

export interface AddVocabularyInput {
  term: string;
  translation?: string;
  context?: string;
  articleId: string;
  articleTitle: string;
}

function cleanText(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ');
}

/** Case- and whitespace-insensitive form used for identity and deduplication. */
export function normalizeVocabularyTerm(term: string): string {
  return cleanText(term).toLowerCase();
}

/**
 * Stable, collision-free id: both tuple parts are percent-encoded and joined by
 * a delimiter that encodeURIComponent always escapes inside the parts, so a
 * value containing the delimiter cannot be mistaken for the tuple boundary.
 */
export function createVocabularyId(articleId: string, term: string): string {
  const article = encodeURIComponent(articleId.trim());
  const normalizedTerm = encodeURIComponent(normalizeVocabularyTerm(term));
  return `vocab-${article}:${normalizedTerm}`;
}

export function normalizeVocabularyEntry(
  value: unknown,
): VocabularyEntry | null {
  if (!isRecord(value)) return null;
  if (!isNonEmptyString(value.id)) return null;
  if (!isNonEmptyString(value.term)) return null;
  if (typeof value.translation !== 'string') return null;
  if (typeof value.context !== 'string') return null;
  if (!isNonEmptyString(value.articleId)) return null;
  if (!isNonEmptyString(value.articleTitle)) return null;
  if (!isIsoDateString(value.createdAt)) return null;
  if (!isIsoDateString(value.updatedAt)) return null;
  if (
    value.deletedAt !== undefined &&
    !isIsoDateString(value.deletedAt)
  ) {
    return null;
  }

  const entry: VocabularyEntry = {
    id: value.id,
    term: cleanText(value.term),
    translation: value.translation.trim(),
    context: value.context.trim(),
    articleId: value.articleId.trim(),
    articleTitle: value.articleTitle.trim(),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
  if (value.deletedAt !== undefined) {
    entry.deletedAt = value.deletedAt;
  }
  return entry;
}

function entryComparableKey(entry: VocabularyEntry): string {
  return JSON.stringify([
    entry.id,
    entry.term,
    entry.translation,
    entry.context,
    entry.articleId,
    entry.articleTitle,
    entry.createdAt,
    entry.updatedAt,
    entry.deletedAt ?? '',
  ]);
}

/**
 * Last-write-wins merge with tombstones. A deletion beats a live copy with the
 * same updatedAt; otherwise the latest updatedAt wins. Remaining ties use a
 * stable field ordering so both merge directions produce the same entry.
 */
export function mergeVocabularyEntries(
  left: VocabularyEntry,
  right: VocabularyEntry,
): VocabularyEntry {
  const leftTime = Date.parse(left.updatedAt);
  const rightTime = Date.parse(right.updatedAt);
  if (leftTime !== rightTime) {
    return leftTime > rightTime ? left : right;
  }

  const leftDeleted = left.deletedAt !== undefined;
  const rightDeleted = right.deletedAt !== undefined;
  if (leftDeleted !== rightDeleted) {
    return leftDeleted ? left : right;
  }

  return entryComparableKey(left) >= entryComparableKey(right)
    ? left
    : right;
}

function compareVocabularyEntries(
  left: VocabularyEntry,
  right: VocabularyEntry,
): number {
  if (left.createdAt !== right.createdAt) {
    return left.createdAt < right.createdAt ? 1 : -1;
  }
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
}

/** Deterministic merge of any number of vocabulary lists, newest first. */
export function mergeVocabularyLists(
  ...lists: VocabularyEntry[][]
): VocabularyEntry[] {
  const byId = new Map<string, VocabularyEntry>();
  for (const list of lists) {
    for (const entry of list) {
      const existing = byId.get(entry.id);
      byId.set(
        entry.id,
        existing ? mergeVocabularyEntries(existing, entry) : entry,
      );
    }
  }
  return [...byId.values()].sort(compareVocabularyEntries);
}

function nextTimestamp(previous: string): string {
  const now = Date.now();
  const previousTime = Date.parse(previous);
  const next = Number.isFinite(previousTime)
    ? Math.max(now, previousTime + 1)
    : now;
  return new Date(next).toISOString();
}

function readVocabulary(): VocabularyEntry[] {
  return readStudyRecords().vocabulary ?? [];
}

function writeVocabulary(vocabulary: VocabularyEntry[]): void {
  const records = readStudyRecords();
  writeStudyRecords({ ...records, vocabulary });
}

function normalizeInput(input: AddVocabularyInput): {
  term: string;
  translation: string;
  context: string;
  articleId: string;
  articleTitle: string;
} {
  const term = cleanText(input.term);
  const articleId = input.articleId.trim();
  const articleTitle = input.articleTitle.trim();
  if (!term || !articleId || !articleTitle) {
    throw new Error('Invalid vocabulary input.');
  }
  return {
    term,
    translation: (input.translation ?? '').trim(),
    context: (input.context ?? '').trim(),
    articleId,
    articleTitle,
  };
}

/** Live entries only, newest first. Deleted entries stay stored as tombstones. */
export function listVocabulary(): VocabularyEntry[] {
  return readVocabulary()
    .filter((entry) => entry.deletedAt === undefined)
    .sort(compareVocabularyEntries);
}

export function addVocabulary(input: AddVocabularyInput): VocabularyEntry {
  const normalized = normalizeInput(input);
  const id = createVocabularyId(normalized.articleId, normalized.term);
  const vocabulary = readVocabulary();
  const index = vocabulary.findIndex((entry) => entry.id === id);
  const existing = index === -1 ? undefined : vocabulary[index];

  if (existing && existing.deletedAt === undefined) {
    return existing;
  }

  const now = new Date().toISOString();
  const entry: VocabularyEntry = existing
    ? {
        id,
        term: normalized.term,
        translation: normalized.translation || existing.translation,
        context: normalized.context || existing.context,
        articleId: normalized.articleId,
        articleTitle: normalized.articleTitle,
        createdAt: existing.createdAt,
        updatedAt: nextTimestamp(existing.updatedAt),
      }
    : {
        id,
        term: normalized.term,
        translation: normalized.translation,
        context: normalized.context,
        articleId: normalized.articleId,
        articleTitle: normalized.articleTitle,
        createdAt: now,
        updatedAt: now,
      };

  const next = vocabulary.slice();
  if (index === -1) {
    next.push(entry);
  } else {
    next[index] = entry;
  }
  writeVocabulary(next);
  return entry;
}

export function updateVocabulary(
  id: string,
  patch: { translation?: string },
): void {
  if (patch.translation === undefined) return;

  const vocabulary = readVocabulary();
  const index = vocabulary.findIndex((entry) => entry.id === id);
  if (index === -1) return;
  const existing = vocabulary[index];
  if (existing.deletedAt !== undefined) return;

  const next = vocabulary.slice();
  next[index] = {
    ...existing,
    translation: patch.translation.trim(),
    updatedAt: nextTimestamp(existing.updatedAt),
  };
  writeVocabulary(next);
}

export function deleteVocabulary(id: string): void {
  const vocabulary = readVocabulary();
  const index = vocabulary.findIndex((entry) => entry.id === id);
  if (index === -1) return;
  const existing = vocabulary[index];
  if (existing.deletedAt !== undefined) return;

  const tombstoneAt = nextTimestamp(existing.updatedAt);
  const next = vocabulary.slice();
  next[index] = {
    ...existing,
    updatedAt: tombstoneAt,
    deletedAt: tombstoneAt,
  };
  writeVocabulary(next);
}
