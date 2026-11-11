import { describe, expect, it } from 'vitest';
import { appBasename } from './basename';

describe('appBasename', () => {
  it('strips the trailing slash from a project base', () => {
    expect(appBasename('/french-reading-app/')).toBe('/french-reading-app');
  });

  it('keeps the root base usable', () => {
    expect(appBasename('/')).toBe('/');
  });

  it('returns the root for an empty base', () => {
    expect(appBasename('')).toBe('/');
  });
});
