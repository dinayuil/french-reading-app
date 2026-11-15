import { readRaw, removeRaw, writeJSONStrict } from '../../lib/storage';
import {
  isFiniteNonNegative,
  isIntegerNonNegative,
  isIsoDateString,
  isNonEmptyString,
  isRecord,
} from '../data/validation';
import {
  createPracticeOrder,
  type PracticeQuestionLike,
  type RandomSource,
} from './randomization';

export const PRACTICE_DRAFT_VERSION = 1;
export const PRACTICE_DRAFT_KEY_PREFIX = 'practice-draft:';

export interface PracticeArticleLike {
  id: string;
  questions: readonly PracticeQuestionLike[];
}

export interface PracticeDraft {
  version: typeof PRACTICE_DRAFT_VERSION;
  /** The record id the submitted attempt will keep. */
  id: string;
  articleId: string;
  /** Article question ids and option texts, so stale drafts are rejected. */
  signature: string;
  startedAt: string;
  questionOrder: string[];
  optionOrders: Record<string, number[]>;
  /** Original option indices keyed by question id. */
  answers: Record<string, number | null>;
  markedWords: string[];
  elapsedMs: number;
}

export interface CreatePracticeDraftInput {
  article: PracticeArticleLike;
  id: string;
  startedAt: string;
  rng?: RandomSource;
}

export interface CompletionStamp {
  completedAt: string;
  completedDay: string;
}

export function practiceDraftKey(articleId: string): string {
  return `${PRACTICE_DRAFT_KEY_PREFIX}${articleId}`;
}

export function createPracticeSignature(
  questions: readonly PracticeQuestionLike[],
): string {
  return JSON.stringify(
    questions.map((question) => [
      question.id,
      question.prompt ?? null,
      question.answerIndex ?? null,
      question.options,
    ]),
  );
}

export function createPracticeDraft({
  article,
  id,
  startedAt,
  rng = Math.random,
}: CreatePracticeDraftInput): PracticeDraft {
  const { questionOrder, optionOrders } = createPracticeOrder(
    article.questions,
    rng,
  );
  return {
    version: PRACTICE_DRAFT_VERSION,
    id,
    articleId: article.id,
    signature: createPracticeSignature(article.questions),
    startedAt,
    questionOrder,
    optionOrders,
    answers: {},
    markedWords: [],
    elapsedMs: 0,
  };
}

function isQuestionOrder(
  value: unknown,
  questions: readonly PracticeQuestionLike[],
): value is string[] {
  if (!Array.isArray(value) || value.length !== questions.length) return false;
  const expected = new Set(questions.map((question) => question.id));
  if (expected.size !== questions.length) return false;
  const seen = new Set<string>();
  for (const id of value) {
    if (typeof id !== 'string' || !expected.has(id) || seen.has(id)) {
      return false;
    }
    seen.add(id);
  }
  return seen.size === questions.length;
}

function isOptionOrder(value: unknown, optionCount: number): value is number[] {
  if (!Array.isArray(value) || value.length !== optionCount) return false;
  const seen = new Set<number>();
  for (const index of value) {
    if (
      !isIntegerNonNegative(index) ||
      index >= optionCount ||
      seen.has(index)
    ) {
      return false;
    }
    seen.add(index);
  }
  return seen.size === optionCount;
}

function areValidAnswers(
  value: unknown,
  questions: readonly PracticeQuestionLike[],
): value is Record<string, number | null> {
  if (!isRecord(value)) return false;
  const optionCounts = new Map(
    questions.map((question) => [question.id, question.options.length]),
  );
  for (const [questionId, selected] of Object.entries(value)) {
    const optionCount = optionCounts.get(questionId);
    if (optionCount === undefined) return false;
    if (selected === null) continue;
    if (!isIntegerNonNegative(selected) || selected >= optionCount) {
      return false;
    }
  }
  return true;
}

function isPracticeDraftFor(
  value: unknown,
  article: PracticeArticleLike,
): value is PracticeDraft {
  if (!isRecord(value)) return false;
  if (value.version !== PRACTICE_DRAFT_VERSION) return false;
  if (!isNonEmptyString(value.id)) return false;
  if (value.articleId !== article.id) return false;
  if (value.signature !== createPracticeSignature(article.questions)) {
    return false;
  }
  if (!isIsoDateString(value.startedAt)) return false;
  if (!isFiniteNonNegative(value.elapsedMs)) return false;
  if (!isQuestionOrder(value.questionOrder, article.questions)) return false;
  if (!isRecord(value.optionOrders)) return false;
  if (Object.keys(value.optionOrders).length !== article.questions.length) {
    return false;
  }
  for (const question of article.questions) {
    if (
      !isOptionOrder(
        value.optionOrders[question.id],
        question.options.length,
      )
    ) {
      return false;
    }
  }
  if (!areValidAnswers(value.answers, article.questions)) return false;
  if (
    !Array.isArray(value.markedWords) ||
    !value.markedWords.every((word) => isNonEmptyString(word))
  ) {
    return false;
  }
  return true;
}

function discardDraft(articleId: string): void {
  try {
    removeRaw(practiceDraftKey(articleId));
  } catch {
    // Storage may be unavailable; the caller still starts a fresh attempt.
  }
}

/**
 * Returns only a draft that still matches the article's questions and option
 * texts. Malformed or stale drafts are discarded instead of partially applied.
 */
export function loadPracticeDraft(
  article: PracticeArticleLike,
): PracticeDraft | null {
  const raw = readRaw(practiceDraftKey(article.id));
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    discardDraft(article.id);
    return null;
  }

  if (!isPracticeDraftFor(parsed, article)) {
    discardDraft(article.id);
    return null;
  }
  return parsed;
}

/** Drafts live under their own key and are never part of study backups. */
export function savePracticeDraft(draft: PracticeDraft): void {
  writeJSONStrict(practiceDraftKey(draft.articleId), draft);
}

export function clearPracticeDraft(articleId: string): void {
  removeRaw(practiceDraftKey(articleId));
}

export function localDayKey(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getCompletionStamp(date: Date): CompletionStamp {
  return {
    completedAt: date.toISOString(),
    completedDay: localDayKey(date),
  };
}
