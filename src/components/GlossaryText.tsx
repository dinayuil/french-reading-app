import { Fragment, useId } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import type { GlossaryEntry } from '../types/content';
import { findMarkedRanges } from '../features/marks/matching';
import { normalizeMarkedTerm } from '../features/marks/articleMarks';

interface GlossaryTextProps {
  text: string;
  glossary: GlossaryEntry[];
  onLookup: (term: string) => void;
  enabled?: boolean;
  ariaLabelForTerm?: (term: string) => string;
  /** Shared article marks; they stay highlighted even when lookup is off. */
  markedTerms?: readonly string[];
  /** Called with the full marked occurrence and its DOM range when clicked. */
  onSelectMarked?: (term: string, range: Range) => void;
}

interface GlossaryRange {
  start: number;
  end: number;
  term: string;
}

interface MarkedRange {
  start: number;
  end: number;
  term: string;
}

interface TextSegment {
  start: number;
  end: number;
  glossaryStart?: number;
  glossaryTerm?: string;
  marked: boolean;
  markId?: string;
  markTerm?: string;
  /** Every occurrence id covering this slice, including overlapping marks. */
  markIds?: string[];
}

interface RenderItem {
  glossaryStart?: number;
  glossaryTerm?: string;
  segments: TextSegment[];
}

function buildGlossaryRegex(terms: string[]): RegExp | null {
  const sorted = [...terms].sort((a, b) => b.length - a.length);
  if (sorted.length === 0) return null;

  const escaped = sorted.map((term) =>
    term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  );
  return new RegExp(`(${escaped.join('|')})`, 'g');
}

function findGlossaryRanges(
  text: string,
  glossary: GlossaryEntry[],
): GlossaryRange[] {
  const regex = buildGlossaryRegex(glossary.map((entry) => entry.term));
  if (!regex) return [];

  const ranges: GlossaryRange[] = [];
  let match = regex.exec(text);
  while (match !== null) {
    if (match[0].length > 0) {
      ranges.push({
        start: match.index,
        end: match.index + match[0].length,
        term: match[0],
      });
    } else {
      regex.lastIndex += 1;
    }
    match = regex.exec(text);
  }
  return ranges;
}

/**
 * Keeps each stored term's own occurrence so a click can select the whole
 * phrase even when another mark overlaps it.
 */
function findMarkedTermRanges(
  text: string,
  terms: readonly string[],
): MarkedRange[] {
  const ranges: MarkedRange[] = [];
  const seen = new Set<string>();

  for (const term of terms) {
    for (const range of findMarkedRanges(text, [term], { merge: false })) {
      const key = `${range.start}:${range.end}`;
      if (seen.has(key)) continue;
      seen.add(key);
      ranges.push({
        ...range,
        term: text.slice(range.start, range.end),
      });
    }
  }

  return ranges;
}

function markIdFor(markIdPrefix: string, range: MarkedRange): string {
  return `${markIdPrefix}-${range.start}-${range.end}`;
}

/**
 * A shared slice may belong to several overlapping occurrences. The longest
 * and then earliest occurrence owns the click; all of them keep their id so a
 * selected occurrence can still build its full DOM range.
 */
function bestMarkedRange(ranges: MarkedRange[]): MarkedRange | undefined {
  let best: MarkedRange | undefined;
  for (const range of ranges) {
    if (
      !best ||
      range.end - range.start > best.end - best.start ||
      (range.end - range.start === best.end - best.start &&
        range.start < best.start)
    ) {
      best = range;
    }
  }
  return best;
}

/**
 * Splits the raw sentence at every glossary and marked boundary so text is
 * preserved exactly and neither feature can nest one interactive control
 * inside another.
 */
function buildSegments(
  text: string,
  glossaryRanges: GlossaryRange[],
  markedRanges: MarkedRange[],
  markIdPrefix: string,
): TextSegment[] {
  if (glossaryRanges.length === 0 && markedRanges.length === 0) return [];

  const boundaries = new Set<number>([0, text.length]);
  for (const range of [...glossaryRanges, ...markedRanges]) {
    boundaries.add(range.start);
    boundaries.add(range.end);
  }

  const sorted = [...boundaries]
    .filter((value) => value >= 0 && value <= text.length)
    .sort((a, b) => a - b);
  const segments: TextSegment[] = [];

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const start = sorted[index];
    const end = sorted[index + 1];
    if (start === end) continue;

    const glossaryRange = glossaryRanges.find(
      (range) => range.start <= start && end <= range.end,
    );
    const coveringMarks = markedRanges.filter(
      (range) => range.start <= start && end <= range.end,
    );
    const markedRange = bestMarkedRange(coveringMarks);

    segments.push({
      start,
      end,
      glossaryStart: glossaryRange?.start,
      glossaryTerm: glossaryRange?.term,
      marked: markedRange !== undefined,
      markId: markedRange
        ? markIdFor(markIdPrefix, markedRange)
        : undefined,
      markTerm: markedRange?.term,
      markIds: coveringMarks.map((range) => markIdFor(markIdPrefix, range)),
    });
  }

  return segments;
}

/**
 * A mark may cover only part of a glossary term. Group adjacent pieces of the
 * same term so it remains one lookup button instead of several duplicates.
 */
function groupSegments(segments: TextSegment[]): RenderItem[] {
  const items: RenderItem[] = [];

  for (const segment of segments) {
    const last = items[items.length - 1];
    if (
      segment.glossaryStart !== undefined &&
      last?.glossaryStart === segment.glossaryStart
    ) {
      last.segments.push(segment);
      continue;
    }
    items.push({
      glossaryStart: segment.glossaryStart,
      glossaryTerm: segment.glossaryTerm,
      segments: [segment],
    });
  }

  return items;
}

function currentSelectionText(): string {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return '';
  return selection.toString().replace(/\s+/g, ' ').trim();
}

function rangeForMarkedOccurrence(
  element: HTMLElement,
  markId: string,
): Range | null {
  const root = element.closest('.article-body') ?? element.ownerDocument;
  const nodes = Array.from(
    root.querySelectorAll<HTMLElement>('[data-mark-ids]'),
  )
    .filter((candidate) =>
      candidate.dataset.markIds?.split(/\s+/).includes(markId),
    )
    .map((candidate) => candidate.firstChild)
    .filter((node): node is Text => node?.nodeType === Node.TEXT_NODE);

  if (nodes.length === 0) return null;

  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  const range = element.ownerDocument.createRange();
  range.setStart(first, 0);
  range.setEnd(last, last.length);
  return range;
}

/**
 * Selects the full stored occurrence, not just the segment under the pointer.
 * An in-progress drag selection is left untouched and counts as handled so an
 * enclosing glossary button does not replace it with a lookup either.
 */
function selectMarkedOccurrence(
  element: HTMLElement,
  segment: TextSegment,
  onSelectMarked: ((term: string, range: Range) => void) | undefined,
  preserveManualSelection = false,
): boolean {
  if (
    !onSelectMarked ||
    !segment.marked ||
    !segment.markId ||
    !segment.markTerm
  ) {
    return false;
  }

  if (preserveManualSelection) {
    const selected = currentSelectionText();
    if (
      selected &&
      normalizeMarkedTerm(selected) !== normalizeMarkedTerm(segment.markTerm)
    ) {
      return true;
    }
  }

  const range = rangeForMarkedOccurrence(element, segment.markId);
  if (!range) return false;

  onSelectMarked(segment.markTerm, range);
  return true;
}

function renderSegment(
  text: string,
  segment: TextSegment,
  key: string,
  interactive: boolean,
  onSelectMarked: ((term: string, range: Range) => void) | undefined,
) {
  const content = text.slice(segment.start, segment.end);
  const canSelect = segment.marked && onSelectMarked !== undefined;
  const canUseKeyboard = canSelect && interactive;

  const activatePointer = (element: HTMLElement) => {
    selectMarkedOccurrence(element, segment, onSelectMarked, true);
  };

  const activateKeyboard = (element: HTMLElement) => {
    selectMarkedOccurrence(element, segment, onSelectMarked);
  };

  return (
    <span
      key={key}
      className={[
        segment.marked ? 'mark-highlight' : '',
        canUseKeyboard ? 'mark-highlight--interactive' : '',
      ]
        .filter(Boolean)
        .join(' ') || undefined}
      data-mark-ids={
        segment.markIds && segment.markIds.length > 0
          ? segment.markIds.join(' ')
          : undefined
      }
      role={canUseKeyboard ? 'button' : undefined}
      tabIndex={canUseKeyboard ? 0 : undefined}
      onClick={
        canSelect
          ? (event: MouseEvent<HTMLSpanElement>) => {
              event.stopPropagation();
              activatePointer(event.currentTarget);
            }
          : undefined
      }
      onKeyDown={
        canUseKeyboard
          ? (event: KeyboardEvent<HTMLSpanElement>) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              event.stopPropagation();
              activateKeyboard(event.currentTarget);
            }
          : undefined
      }
    >
      {content}
    </span>
  );
}

export default function GlossaryText({
  text,
  glossary,
  onLookup,
  enabled = true,
  ariaLabelForTerm,
  markedTerms = [],
  onSelectMarked,
}: GlossaryTextProps) {
  const markIdPrefix = useId();
  const lookupEnabled = enabled && glossary.length > 0;
  const glossaryRanges = lookupEnabled
    ? findGlossaryRanges(text, glossary)
    : [];
  const markedRanges =
    markedTerms.length > 0 ? findMarkedTermRanges(text, markedTerms) : [];
  const segments = buildSegments(
    text,
    glossaryRanges,
    markedRanges,
    markIdPrefix,
  );

  if (segments.length === 0) {
    return <>{text}</>;
  }

  return (
    <>
      {groupSegments(segments).map((item) => {
        const parts = item.segments.map((segment) =>
          renderSegment(
            text,
            segment,
            `${segment.start}-${segment.end}`,
            onSelectMarked !== undefined &&
              segment.marked &&
              segment.glossaryStart === undefined,
            onSelectMarked,
          ),
        );

        if (item.glossaryTerm && item.glossaryStart !== undefined) {
          const term = item.glossaryTerm;
          const firstSegment = item.segments[0];
          const markedSegment = item.segments.reduce<TextSegment | undefined>(
            (best, segment) => {
              if (!segment.marked || !segment.markId) return best;
              if (
                !best ||
                (segment.markTerm?.length ?? 0) > (best.markTerm?.length ?? 0)
              ) {
                return segment;
              }
              return best;
            },
            undefined,
          );
          const fullyMarked =
            onSelectMarked !== undefined &&
            firstSegment.markId !== undefined &&
            item.segments.every(
              (segment) =>
                segment.marked && segment.markId === firstSegment.markId,
            );

          return (
            <button
              key={item.glossaryStart}
              type="button"
              className="gloss-term"
              onClick={(event) => {
                const keyboard = event.detail === 0;
                const segment = fullyMarked
                  ? firstSegment
                  : keyboard
                    ? markedSegment
                    : undefined;
                if (
                  segment &&
                  selectMarkedOccurrence(
                    event.currentTarget,
                    segment,
                    onSelectMarked,
                    !keyboard,
                  )
                ) {
                  return;
                }
                onLookup(term);
              }}
              aria-label={ariaLabelForTerm ? ariaLabelForTerm(term) : term}
            >
              {parts}
            </button>
          );
        }

        return (
          <Fragment key={item.segments[0].start}>{parts}</Fragment>
        );
      })}
    </>
  );
}
