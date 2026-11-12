import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readJSON, writeJSON, writeJSONStrict, appendSession } from './storage';

const PREFIX = 'frp:';

describe('storage helpers', () => {
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete store[key];
      }),
      clear: vi.fn(() => {
        store = {};
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns fallback when key is missing', () => {
    expect(readJSON('missing', 42)).toBe(42);
    expect(localStorage.getItem).toHaveBeenCalledWith(`${PREFIX}missing`);
  });

  it('returns fallback when stored JSON is corrupt', () => {
    store[`${PREFIX}corrupt`] = 'not json';
    expect(readJSON('corrupt', [])).toEqual([]);
  });

  it('round-trips JSON values', () => {
    writeJSON('list', [1, 2, 3]);
    expect(readJSON('list', [])).toEqual([1, 2, 3]);
    expect(localStorage.setItem).toHaveBeenCalledWith(
      `${PREFIX}list`,
      JSON.stringify([1, 2, 3]),
    );
  });

  it('throws from the strict writer when storage rejects the write', () => {
    vi.mocked(localStorage.setItem).mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    expect(() => writeJSONStrict('strict', { a: 1 })).toThrow('quota exceeded');
    expect(() => writeJSON('lenient', { a: 1 })).not.toThrow();
  });

  it('appends to the end of an existing array', () => {
    writeJSON('sessions', [{ id: 'a' }]);
    appendSession('sessions', { id: 'b' });
    expect(readJSON('sessions', [])).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('appends to a new array when key is missing', () => {
    appendSession('new-sessions', { id: 'c' });
    expect(readJSON('new-sessions', [])).toEqual([{ id: 'c' }]);
  });

  it.each(['{}', 'null', '42'])(
    'starts from an empty array when stored sessions are %s',
    (stored) => {
      store[`${PREFIX}practice-sessions`] = stored;

      expect(() =>
        appendSession('practice-sessions', { id: 'd' }),
      ).not.toThrow();

      expect(readJSON('practice-sessions', [])).toEqual([{ id: 'd' }]);
    },
  );
});
