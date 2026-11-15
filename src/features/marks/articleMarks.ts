import { notifyStudyDataChanged } from '../../lib/studyDataEvents';
import type { ArticleWordMark } from '../../types/progress';
import {
  isIsoDateString,
  isNonEmptyString,
  isRecord,
} from '../data/validation';
import { readStudyRecords, writeStudyRecords } from '../data/studyData';

const APOSTROPHES = /[\u2018\u2019\u02BC\u02B9\uFF07]/g;

function canonicalApostrophes(value: string): string {
  return value.replace(APOSTROPHES, "'");
}

function cleanText(value: string): string {
  return canonicalApostrophes(value.normalize('NFC'))
    .trim()
    .replace(/\s+/g, ' ');
}

/** Display form: NFC, canonical apostrophes, trimmed and space-collapsed. */
function cleanMarkedTerm(term: string): string {
  return cleanText(term);
}

/** Case- and whitespace-insensitive form used for identity and matching. */
export function normalizeMarkedTerm(term: string): string {
  return cleanText(term).toLowerCase();
}

/**
 * Stable, collision-free id: both tuple parts are percent-encoded and joined by
 * a delimiter that encodeURIComponent always escapes inside the parts, so a
 * value containing the delimiter cannot be mistaken for the tuple boundary.
 */
export function createArticleMarkId(articleId: string, term: string): string {
  const article = encodeURIComponent(articleId.trim());
  const normalizedTerm = encodeURIComponent(normalizeMarkedTerm(term));
  return `mark-${article}:${normalizedTerm}`;
}

export function normalizeArticleWordMark(
  value: unknown,
): ArticleWordMark | null {
  if (!isRecord(value)) return null;
  if (!isNonEmptyString(value.id)) return null;
  if (!isNonEmptyString(value.articleId)) return null;
  if (!isNonEmptyString(value.term)) return null;
  if (!isIsoDateString(value.updatedAt)) return null;
  if (value.deletedAt !== undefined && !isIsoDateString(value.deletedAt)) {
    return null;
  }

  const articleId = value.articleId.trim();
  const term = cleanMarkedTerm(value.term);
  if (!articleId || !term) return null;

  const mark: ArticleWordMark = {
    id: value.id.trim(),
    articleId,
    term,
    updatedAt: value.updatedAt,
  };
  if (value.deletedAt !== undefined) mark.deletedAt = value.deletedAt;
  return mark;
}

function articleMarkIdentity(articleId: string, term: string): string {
  return `${articleId.trim()}\u0000${normalizeMarkedTerm(term)}`;
}

function entryComparableKey(entry: ArticleWordMark): string {
  return JSON.stringify([
    entry.id,
    entry.articleId,
    entry.term,
    entry.updatedAt,
    entry.deletedAt ?? '',
  ]);
}

/**
 * Last-write-wins merge with tombstones. A deletion beats a live copy with the
 * same updatedAt; otherwise the latest updatedAt wins. Remaining ties use a
 * stable field ordering so both merge directions produce the same record.
 */
export function mergeArticleMarkEntries(
  left: ArticleWordMark,
  right: ArticleWordMark,
): ArticleWordMark {
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

function compareArticleMarks(
  left: ArticleWordMark,
  right: ArticleWordMark,
): number {
  const leftIdentity = articleMarkIdentity(left.articleId, left.term);
  const rightIdentity = articleMarkIdentity(right.articleId, right.term);
  if (leftIdentity !== rightIdentity) {
    return leftIdentity < rightIdentity ? -1 : 1;
  }
  if (left.updatedAt !== right.updatedAt) {
    return left.updatedAt < right.updatedAt ? 1 : -1;
  }
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
}

/** Deterministic merge of any number of article mark lists, one per term. */
export function mergeArticleMarks(
  ...lists: ArticleWordMark[][]
): ArticleWordMark[] {
  const byIdentity = new Map<string, ArticleWordMark>();
  for (const list of lists) {
    for (const mark of list) {
      const identity = articleMarkIdentity(mark.articleId, mark.term);
      const existing = byIdentity.get(identity);
      byIdentity.set(
        identity,
        existing ? mergeArticleMarkEntries(existing, mark) : mark,
      );
    }
  }
  return [...byIdentity.values()].sort(compareArticleMarks);
}

/**
 * Live marks for one article: explicit live records first, then legacy practice
 * marks and any supplied draft seed. Explicit tombstones always suppress the
 * same normalized term, so removed marks cannot come back from stale history.
 */
export function listArticleMarks(
  articleId: string,
  legacyTerms: string[] = [],
): string[] {
  const normalizedArticleId =
    typeof articleId === 'string' ? articleId.trim() : '';
  if (!normalizedArticleId) return [];

  const records = readStudyRecords();
  const explicit = mergeArticleMarks(
    (records.articleMarks ?? []).filter(
      (mark) => mark.articleId.trim() === normalizedArticleId,
    ),
  );

  const terms: string[] = [];
  const seen = new Set<string>();
  for (const mark of explicit) {
    const key = normalizeMarkedTerm(mark.term);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (mark.deletedAt === undefined) terms.push(mark.term);
  }

  const fallback: string[] = [];
  for (const session of records.practiceSessions) {
    if (session.articleId.trim() !== normalizedArticleId) continue;
    fallback.push(...session.markedWords);
  }
  if (Array.isArray(legacyTerms)) fallback.push(...legacyTerms);

  for (const term of fallback) {
    if (typeof term !== 'string') continue;
    const key = normalizeMarkedTerm(term);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    terms.push(cleanMarkedTerm(term));
  }

  return terms;
}

function nextTimestamp(previous: string | undefined): string {
  const now = Date.now();
  const previousTime =
    previous === undefined ? Number.NaN : Date.parse(previous);
  const next = Number.isFinite(previousTime)
    ? Math.max(now, previousTime + 1)
    : now;
  return new Date(next).toISOString();
}

/**
 * Writes one article mark in the canonical whole-document storage. The
 * operation is a no-op when the requested state already holds; a committed
 * change notifies listeners exactly once, while storage failures throw without
 * changing the stored document.
 */
export function setArticleMark(
  articleId: string,
  term: string,
  marked: boolean,
): void {
  if (
    typeof articleId !== 'string' ||
    typeof term !== 'string' ||
    typeof marked !== 'boolean'
  ) {
    throw new Error('Invalid article mark input.');
  }

  const normalizedArticleId = articleId.trim();
  const displayTerm = cleanMarkedTerm(term);
  if (!normalizedArticleId || !displayTerm) {
    throw new Error('Invalid article mark input.');
  }

  const records = readStudyRecords();
  const marks = records.articleMarks ?? [];
  const identity = articleMarkIdentity(normalizedArticleId, displayTerm);
  const index = marks.findIndex(
    (mark) => articleMarkIdentity(mark.articleId, mark.term) === identity,
  );

  if (index !== -1) {
    const existing = marks[index];
    if (marked === (existing.deletedAt === undefined)) return;

    const updatedAt = nextTimestamp(existing.updatedAt);
    const next = marks.slice();
    const entry: ArticleWordMark = {
      ...existing,
      articleId: existing.articleId.trim(),
      term: displayTerm,
      updatedAt,
    };
    if (marked) {
      delete entry.deletedAt;
    } else {
      entry.deletedAt = updatedAt;
    }
    next[index] = entry;

    writeStudyRecords({ ...records, articleMarks: next });
    notifyStudyDataChanged();
    return;
  }

  const updatedAt = nextTimestamp(undefined);
  const entry: ArticleWordMark = {
    id: createArticleMarkId(normalizedArticleId, displayTerm),
    articleId: normalizedArticleId,
    term: displayTerm,
    updatedAt,
  };
  if (!marked) entry.deletedAt = updatedAt;

  writeStudyRecords({
    ...records,
    articleMarks: [...marks, entry],
  });
  notifyStudyDataChanged();
}
