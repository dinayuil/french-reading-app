const WORD_CHARACTER = /[\p{L}\p{N}\p{M}]/u;
const COMBINING_MARK = /\p{M}/u;
const APOSTROPHES = /[\u2018\u2019\u02BC\u02B9\uFF07]/g;
const REGEXP_SPECIALS = /[.*+?^${}()|[\]\\]/g;

export interface MarkedRange {
  /** UTF-16 offset into the original text. */
  start: number;
  /** Exclusive UTF-16 offset into the original text. */
  end: number;
}

export interface FindMarkedRangesOptions {
  /** Merge overlapping occurrences into their union (the default). */
  merge?: boolean;
}

function canonicalApostrophes(value: string): string {
  return value.replace(APOSTROPHES, "'");
}

function normalizeCharacter(character: string): string {
  return canonicalApostrophes(character.normalize('NFD').toLowerCase());
}

interface NormalizedText {
  text: string;
  /** Original UTF-16 start for each normalized UTF-16 code unit. */
  starts: number[];
  /** Original UTF-16 end for each normalized UTF-16 code unit. */
  ends: number[];
}

/**
 * Normalizes text for case-insensitive, canonically equivalent matching while
 * keeping a map back to the original offsets.
 */
function normalizeText(text: string): NormalizedText {
  const starts: number[] = [];
  const ends: number[] = [];
  let normalized = '';
  let offset = 0;

  for (const character of text) {
    const value = normalizeCharacter(character);
    normalized += value;
    const end = offset + character.length;
    for (let index = 0; index < value.length; index += 1) {
      starts.push(offset);
      ends.push(end);
    }
    offset = end;
  }

  return { text: normalized, starts, ends };
}

function escapeRegExp(value: string): string {
  return value.replace(REGEXP_SPECIALS, '\\$&');
}

/**
 * Builds a lowercased pattern with canonical apostrophes and tolerant
 * whitespace inside phrases. Empty or whitespace-only terms produce null.
 */
function termPattern(term: string): string | null {
  const normalized = canonicalApostrophes(
    term.normalize('NFD').toLowerCase(),
  ).trim();
  if (!normalized) return null;

  const parts = normalized
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .map(escapeRegExp);
  if (parts.length === 0) return null;

  return parts.join('\\s+');
}

function isCombiningMarkCodePoint(
  codePoint: number | undefined,
): boolean {
  return (
    codePoint !== undefined &&
    COMBINING_MARK.test(String.fromCodePoint(codePoint))
  );
}

function isWordCharacterCodePoint(
  codePoint: number | undefined,
): boolean {
  return (
    codePoint !== undefined &&
    WORD_CHARACTER.test(String.fromCodePoint(codePoint))
  );
}

/** Full Unicode code point immediately before a UTF-16 offset. */
function codePointBefore(text: string, index: number): number | undefined {
  if (index <= 0) return undefined;
  const low = text.charCodeAt(index - 1);
  if (low >= 0xdc00 && low <= 0xdfff && index >= 2) {
    const high = text.charCodeAt(index - 2);
    if (high >= 0xd800 && high <= 0xdbff) {
      return ((high - 0xd800) << 10) + (low - 0xdc00) + 0x10000;
    }
  }
  return low;
}

/** UTF-16 width of the full code point starting at a given offset. */
function codePointWidth(text: string, index: number): number {
  const codePoint = text.codePointAt(index);
  return codePoint !== undefined && codePoint > 0xffff ? 2 : 1;
}

/**
 * Rejects matches that start or end inside a Unicode grapheme (for example the
 * "e" inside "é") or that touch another letter, digit or combining mark (for
 * example "est" inside "reste"). Supplementary-plane letters count as single
 * word characters rather than two surrogate halves.
 */
function isMatchBoundary(text: string, start: number, end: number): boolean {
  if (start > 0 && isCombiningMarkCodePoint(text.codePointAt(start))) {
    return false;
  }
  if (end < text.length && isCombiningMarkCodePoint(text.codePointAt(end))) {
    return false;
  }
  if (start > 0 && isWordCharacterCodePoint(codePointBefore(text, start))) {
    return false;
  }
  if (end < text.length && isWordCharacterCodePoint(text.codePointAt(end))) {
    return false;
  }
  return true;
}

/** Sorted copy of the ranges, keeping partially overlapping occurrences. */
function sortRanges(ranges: MarkedRange[]): MarkedRange[] {
  return ranges
    .slice()
    .sort((left, right) => left.start - right.start || left.end - right.end);
}

/** Sorted, non-overlapping union of every selected term range. */
function mergeRanges(ranges: MarkedRange[]): MarkedRange[] {
  const sorted = sortRanges(ranges);
  const merged: MarkedRange[] = [];

  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.start < last.end) {
      if (range.end > last.end) last.end = range.end;
    } else {
      merged.push({ start: range.start, end: range.end });
    }
  }

  return merged;
}

/**
 * Finds every whole-word occurrence of the given terms in raw text. Matching is
 * case-insensitive and canonically equivalent (NFC/NFD), canonicalizes French
 * apostrophes, tolerates whitespace inside phrases, and never folds accents.
 * Returned ranges refer to the untouched original string. Overlapping matches
 * are merged into their union by default, or kept separate with
 * `{ merge: false }`.
 */
export function findMarkedRanges(
  text: string,
  terms: string[],
  options: FindMarkedRangesOptions = {},
): MarkedRange[] {
  if (typeof text !== 'string' || !Array.isArray(terms)) return [];

  const normalized = normalizeText(text);
  const ranges: MarkedRange[] = [];

  for (const term of terms) {
    if (typeof term !== 'string') continue;
    const pattern = termPattern(term);
    if (pattern === null) continue;

    const regex = new RegExp(pattern, 'gu');
    let match = regex.exec(normalized.text);
    while (match !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (end > start && isMatchBoundary(normalized.text, start, end)) {
        ranges.push({
          start: normalized.starts[start],
          end: normalized.ends[end - 1],
        });
      }
      // Resume one code point after the match start, not after its end, so
      // overlapping occurrences of the same term are still discovered.
      regex.lastIndex = start + codePointWidth(normalized.text, start);
      match = regex.exec(normalized.text);
    }
  }

  return options.merge === false ? sortRanges(ranges) : mergeRanges(ranges);
}
