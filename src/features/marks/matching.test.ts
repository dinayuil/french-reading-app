import { describe, expect, it } from 'vitest';
import { findMarkedRanges } from './matching';

describe('findMarkedRanges', () => {
  it('matches mixed case and NFC/NFD forms without moving original offsets', () => {
    const text = 'Le café était fermé.';
    expect(findMarkedRanges(text, ['CAFÉ'])).toEqual([{ start: 3, end: 7 }]);
    expect(findMarkedRanges(text, ['etait'])).toEqual([]);
    expect(findMarkedRanges('Un cafe\u0301 noir.', ['CAFÉ'])).toEqual([
      { start: 3, end: 8 },
    ]);
    expect(findMarkedRanges('Un café noir.', ['cafe\u0301'])).toEqual([
      { start: 3, end: 7 },
    ]);
  });

  it('keeps accents exact and never matches inside a longer word', () => {
    expect(findMarkedRanges('Le the et la theorie.', ['thé'])).toEqual([]);
    expect(findMarkedRanges('la forêt reste calme', ['est'])).toEqual([]);
    expect(findMarkedRanges('Il est là.', ['est'])).toEqual([
      { start: 3, end: 6 },
    ]);
    expect(findMarkedRanges('café', ['e'])).toEqual([]);
    expect(findMarkedRanges('café', ['é'])).toEqual([]);
    expect(findMarkedRanges(' é ', ['é'])).toEqual([{ start: 1, end: 2 }]);
    expect(findMarkedRanges('cafe\u0301', ['e'])).toEqual([]);
    expect(findMarkedRanges(' e\u0301 ', ['é'])).toEqual([
      { start: 1, end: 3 },
    ]);
  });

  it('treats French apostrophes as boundaries and as equivalent characters', () => {
    const text = 'L’homme arrive. Un homme, des hommes.';
    const ranges = findMarkedRanges(text, ['HOMME']);
    expect(ranges.map((range) => text.slice(range.start, range.end))).toEqual([
      'homme',
      'homme',
    ]);
    const first = text.indexOf('homme');
    const second = text.indexOf('homme', first + 1);
    expect(ranges).toEqual([
      { start: first, end: first + 5 },
      { start: second, end: second + 5 },
    ]);
    expect(text.slice(first - 1, first)).toBe('’');

    const mixed = "l'homme est là, l’homme aussi.";
    expect(
      findMarkedRanges(mixed, ['l’homme']).map((range) =>
        mixed.slice(range.start, range.end),
      ),
    ).toEqual(["l'homme", 'l’homme']);
    expect(findMarkedRanges("l'homme", ['lhomme'])).toEqual([]);
  });

  it('tolerates whitespace inside selected phrases', () => {
    const text = 'Le   chat\nnoir dort.';
    expect(findMarkedRanges(text, ['le chat noir'])).toEqual([
      { start: 0, end: 14 },
    ]);
    expect(findMarkedRanges(text, ['chat   noir'])).toEqual([
      { start: 5, end: 14 },
    ]);
  });

  it('escapes regular-expression characters and matches punctuation literally', () => {
    const text = 'Prix (TTC) : 1,50 €. Code a+b*c? Oui.';
    expect(findMarkedRanges(text, ['(ttc)', '1,50 €', 'a+b*c?'])).toEqual([
      { start: 5, end: 10 },
      { start: 13, end: 19 },
      { start: 26, end: 32 },
    ]);
  });

  it('merges overlapping phrases deterministically into their union', () => {
    const text = 'Le chat noir dort.';
    const expected = [{ start: 0, end: 12 }];
    expect(findMarkedRanges(text, ['le chat', 'chat noir'])).toEqual(expected);
    expect(findMarkedRanges(text, ['chat noir', 'le chat'])).toEqual(expected);
    expect(findMarkedRanges(text, ['chat', 'le chat noir'])).toEqual(expected);
  });

  it('finds overlapping occurrences of the same phrase and merges their union', () => {
    const text = 'Très très très bien.';
    expect(findMarkedRanges(text, ['très très'])).toEqual([
      { start: 0, end: 14 },
    ]);
    expect(text.slice(0, 14)).toBe('Très très très');
  });

  it('can keep same-phrase overlapping occurrences separate on request', () => {
    const text = 'Très très très bien.';
    expect(
      findMarkedRanges(text, ['très très'], { merge: false }),
    ).toEqual([
      { start: 0, end: 9 },
      { start: 5, end: 14 },
    ]);
    expect(findMarkedRanges(text, ['très très'])).toEqual([
      { start: 0, end: 14 },
    ]);
  });

  it('uses supplementary Unicode letters as boundaries and keeps UTF-16 offsets', () => {
    expect(findMarkedRanges('𐐀Paris', ['Paris'])).toEqual([]);
    expect(findMarkedRanges('Paris𐐀', ['Paris'])).toEqual([]);

    const text = '𐐀Paris Paris𐐀 Paris.';
    const ranges = findMarkedRanges(text, ['Paris']);
    expect(ranges).toEqual([{ start: 16, end: 21 }]);
    expect(text.slice(ranges[0].start, ranges[0].end)).toBe('Paris');
  });

  it('returns sorted non-overlapping ranges over the raw text', () => {
    const text = 'reste estimé, est là; reste.';
    const ranges = findMarkedRanges(text, ['est']);
    expect(ranges).toEqual([{ start: 14, end: 17 }]);
    expect(text.slice(ranges[0].start, ranges[0].end)).toBe('est');

    expect(findMarkedRanges('mot mot MOT.', ['mot'])).toEqual([
      { start: 0, end: 3 },
      { start: 4, end: 7 },
      { start: 8, end: 11 },
    ]);
  });

  it('respects selected words around hyphens', () => {
    const text = 'Un rendez-vous bien-être.';
    expect(findMarkedRanges(text, ['rendez-vous'])).toEqual([
      { start: 3, end: 14 },
    ]);
    expect(findMarkedRanges(text, ['vous', 'bien'])).toEqual([
      { start: 10, end: 14 },
      { start: 15, end: 19 },
    ]);
    expect(findMarkedRanges(text, ['rendezvous'])).toEqual([]);
  });

  it('deduplicates repeated equivalent terms', () => {
    expect(findMarkedRanges('chat', ['chat', 'CHAT', ' chat '])).toEqual([
      { start: 0, end: 4 },
    ]);
  });

  it('ignores empty terms', () => {
    expect(findMarkedRanges('chat', [])).toEqual([]);
    expect(findMarkedRanges('chat', ['', '   '])).toEqual([]);
  });
});
