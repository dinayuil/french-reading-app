import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addVocabulary,
  createVocabularyId,
  deleteVocabulary,
  listVocabulary,
  updateVocabulary,
} from './vocabulary';
import { readStudyRecords } from '../data/studyData';

describe('vocabulary', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('adds an entry with trimmed terms and empty optional text', () => {
    const entry = addVocabulary({
      term: '  Bonjour   le   monde ',
      articleId: 'article-a',
      articleTitle: ' Article A ',
    });

    expect(entry).toMatchObject({
      term: 'Bonjour le monde',
      translation: '',
      context: '',
      articleId: 'article-a',
      articleTitle: 'Article A',
    });
    expect(entry.id).toEqual(expect.any(String));
    expect(Date.parse(entry.createdAt)).not.toBeNaN();
    expect(entry.updatedAt).toBe(entry.createdAt);
    expect(entry).not.toHaveProperty('deletedAt');
    expect(listVocabulary()).toEqual([entry]);
  });

  it('derives a collision-free id from the encoded article and normalized term', () => {
    expect(
      createVocabularyId(' article ', '  Bonjour   LE monde '),
    ).toBe(createVocabularyId('article', 'bonjour le monde'));

    expect(createVocabularyId('article', 'bonjour')).not.toBe(
      createVocabularyId('article', 'bonjours'),
    );
    expect(createVocabularyId('article-a', 'bonjour')).not.toBe(
      createVocabularyId('article-b', 'bonjour'),
    );
    expect(createVocabularyId('article', "c'est")).not.toBe(
      createVocabularyId('article', 'cest'),
    );

    const articleWithDelimiter = createVocabularyId('article:a', 'b');
    const termWithDelimiter = createVocabularyId('article', 'a:b');
    expect(articleWithDelimiter).not.toBe(termWithDelimiter);
    expect(articleWithDelimiter).toContain(
      encodeURIComponent('article:a'),
    );
    expect(termWithDelimiter).toContain(encodeURIComponent('a:b'));

    expect(createVocabularyId('a%3Ab', 'c')).not.toBe(
      createVocabularyId('a', 'b:c'),
    );
    expect(createVocabularyId('a/b', 'c')).not.toBe(
      createVocabularyId('a', 'b/c'),
    );
  });

  it('keeps one stable entry per article and normalized term', () => {
    const first = addVocabulary({
      term: 'Bonjour',
      translation: '你好',
      articleId: 'article-a',
      articleTitle: 'Article A',
    });
    const sameTerm = addVocabulary({
      term: '  bonjour ',
      translation: '另一个释义',
      articleId: 'article-a',
      articleTitle: 'Article A',
    });
    const otherArticle = addVocabulary({
      term: 'bonjour',
      articleId: 'article-b',
      articleTitle: 'Article B',
    });
    const otherTerm = addVocabulary({
      term: 'merci',
      articleId: 'article-a',
      articleTitle: 'Article A',
    });

    expect(sameTerm.id).toBe(first.id);
    expect(otherArticle.id).not.toBe(first.id);
    expect(otherTerm.id).not.toBe(first.id);
    expect(listVocabulary()).toHaveLength(3);
    expect(readStudyRecords().vocabulary).toHaveLength(3);

    const reloaded = listVocabulary().find((item) => item.id === first.id);
    expect(reloaded?.translation).toBe('你好');
  });

  it('rejects blank terms and blank article identifiers', () => {
    expect(() =>
      addVocabulary({
        term: '   ',
        articleId: 'article-a',
        articleTitle: 'Article A',
      }),
    ).toThrow();
    expect(() =>
      addVocabulary({
        term: 'bonjour',
        articleId: ' ',
        articleTitle: 'Article A',
      }),
    ).toThrow();
    expect(() =>
      addVocabulary({
        term: 'bonjour',
        articleId: 'article-a',
        articleTitle: '',
      }),
    ).toThrow();
    expect(listVocabulary()).toEqual([]);
  });

  it('updates only the translation and bumps the update time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-15T10:00:00.000Z'));
    const entry = addVocabulary({
      term: 'bonjour',
      translation: '你好',
      context: 'Bonjour !',
      articleId: 'article-a',
      articleTitle: 'Article A',
    });

    updateVocabulary(entry.id, { translation: ' 您好 ' });

    const updated = listVocabulary()[0];
    expect(updated).toMatchObject({
      id: entry.id,
      term: 'bonjour',
      translation: '您好',
      context: 'Bonjour !',
    });
    expect(Date.parse(updated.updatedAt)).toBeGreaterThan(
      Date.parse(entry.updatedAt),
    );
  });

  it('ignores updates and deletes for missing or already deleted entries', () => {
    updateVocabulary('missing', { translation: 'x' });
    deleteVocabulary('missing');
    expect(listVocabulary()).toEqual([]);

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-15T10:00:00.000Z'));
    const entry = addVocabulary({
      term: 'bonjour',
      articleId: 'article-a',
      articleTitle: 'Article A',
    });
    deleteVocabulary(entry.id);
    const tombstone = readStudyRecords().vocabulary?.[0];

    updateVocabulary(entry.id, { translation: 'after delete' });
    deleteVocabulary(entry.id);

    expect(readStudyRecords().vocabulary?.[0]).toEqual(tombstone);
    expect(listVocabulary()).toEqual([]);
  });

  it('keeps a tombstone out of the list and lets an explicit re-add revive the same id', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-15T10:00:00.000Z'));
    const entry = addVocabulary({
      term: 'bonjour',
      translation: '你好',
      articleId: 'article-a',
      articleTitle: 'Article A',
    });
    vi.setSystemTime(new Date('2026-11-15T11:00:00.000Z'));
    deleteVocabulary(entry.id);

    const tombstone = readStudyRecords().vocabulary?.[0];
    expect(tombstone).toMatchObject({
      id: entry.id,
      deletedAt: '2026-11-15T11:00:00.000Z',
    });
    expect(listVocabulary()).toEqual([]);

    vi.setSystemTime(new Date('2026-11-15T12:00:00.000Z'));
    const revived = addVocabulary({
      term: 'bonjour',
      articleId: 'article-a',
      articleTitle: 'Article A',
    });

    expect(revived.id).toBe(entry.id);
    expect(revived.createdAt).toBe(entry.createdAt);
    expect(revived).not.toHaveProperty('deletedAt');
    expect(listVocabulary()).toEqual([revived]);
    expect(readStudyRecords().vocabulary).toHaveLength(1);
  });

  it('preserves the stored data when a vocabulary write fails', () => {
    const entry = addVocabulary({
      term: 'bonjour',
      translation: '你好',
      articleId: 'article-a',
      articleTitle: 'Article A',
    });
    const raw = localStorage.getItem('frp:study-data');

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    expect(() =>
      addVocabulary({
        term: 'merci',
        articleId: 'article-a',
        articleTitle: 'Article A',
      }),
    ).toThrow('quota exceeded');
    expect(() =>
      updateVocabulary(entry.id, { translation: 'changed' }),
    ).toThrow('quota exceeded');
    expect(() => deleteVocabulary(entry.id)).toThrow('quota exceeded');

    vi.restoreAllMocks();
    expect(localStorage.getItem('frp:study-data')).toBe(raw);
    expect(listVocabulary()).toEqual([entry]);
  });
});
