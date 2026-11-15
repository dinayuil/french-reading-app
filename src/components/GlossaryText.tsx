import { Fragment } from 'react';
import type { GlossaryEntry } from '../types/content';
import { findMarkedRanges } from '../features/marks/matching';

interface GlossaryTextProps {
  text: string;
  glossary: GlossaryEntry[];
  onLookup: (term: string) => void;
  enabled?: boolean;
  ariaLabelForTerm?: (term: string) => string;
  /** Shared article marks; they stay highlighted even when lookup is off. */
  markedTerms?: readonly string[];
}

interface GlossaryRange {
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
 * Splits the raw sentence at every glossary and marked boundary so text is
 * preserved exactly and neither feature can nest one interactive control
 * inside another.
 */
function buildSegments(
  text: string,
  glossaryRanges: GlossaryRange[],
  markedRanges: { start: number; end: number }[],
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
    const marked = markedRanges.some(
      (range) => range.start <= start && end <= range.end,
    );

    segments.push({
      start,
      end,
      glossaryStart: glossaryRange?.start,
      glossaryTerm: glossaryRange?.term,
      marked,
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

function renderSegment(text: string, segment: TextSegment, key: string) {
  const content = text.slice(segment.start, segment.end);
  return (
    <span key={key} className={segment.marked ? 'mark-highlight' : undefined}>
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
}: GlossaryTextProps) {
  const lookupEnabled = enabled && glossary.length > 0;
  const glossaryRanges = lookupEnabled
    ? findGlossaryRanges(text, glossary)
    : [];
  const markedRanges =
    markedTerms.length > 0 ? findMarkedRanges(text, [...markedTerms]) : [];
  const segments = buildSegments(text, glossaryRanges, markedRanges);

  if (segments.length === 0) {
    return <>{text}</>;
  }

  return (
    <>
      {groupSegments(segments).map((item) => {
        const parts = item.segments.map((segment) =>
          renderSegment(text, segment, `${segment.start}-${segment.end}`),
        );

        if (item.glossaryTerm && item.glossaryStart !== undefined) {
          const term = item.glossaryTerm;
          return (
            <button
              key={item.glossaryStart}
              type="button"
              className="gloss-term"
              onClick={() => onLookup(term)}
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
