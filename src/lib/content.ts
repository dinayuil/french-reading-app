import type {
  Article,
  ArticleImage,
  ArticleIndexEntry,
  ArticleParagraph,
  ArticleTranslation,
  CefrLevel,
  DayIndex,
  GlossaryEntry,
  Manifest,
  Question,
} from '../types/content';

const CEFR_LEVELS: readonly CefrLevel[] = ['A2', 'B1', 'B2'];

const IMAGE_PATH = /^images\/[a-z0-9-]+-[a-f0-9]{12}\.(jpg|png)$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const IMAGE_LICENSE_URLS = new Map<string, string>([
  ['CC0 1.0', 'https://creativecommons.org/publicdomain/zero/1.0/'],
  ['Public domain', 'https://creativecommons.org/publicdomain/mark/1.0/'],
  ['CC BY 2.0', 'https://creativecommons.org/licenses/by/2.0/'],
  ['CC BY 2.5', 'https://creativecommons.org/licenses/by/2.5/'],
  ['CC BY 3.0', 'https://creativecommons.org/licenses/by/3.0/'],
  ['CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/'],
  ['CC BY-SA 2.0', 'https://creativecommons.org/licenses/by-sa/2.0/'],
  ['CC BY-SA 2.5', 'https://creativecommons.org/licenses/by-sa/2.5/'],
  ['CC BY-SA 3.0', 'https://creativecommons.org/licenses/by-sa/3.0/'],
  ['CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0/'],
]);

export class ContentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContentValidationError';
  }
}

export class ContentLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContentLoadError';
  }
}

let manifestCache: Manifest | undefined;
const dayCache = new Map<string, DayIndex>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(path: string, detail: string): never {
  throw new ContentValidationError(`Invalid content at "${path}": ${detail}`);
}

function requireNonEmptyString(
  record: Record<string, unknown>,
  key: string,
  path: string,
): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim() === '') {
    invalid(path, 'expected a non-empty string');
  }
  return value;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isValidCalendarDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) {
    return false;
  }

  const leapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const monthLengths = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return day <= monthLengths[month - 1];
}

function requireCalendarDate(
  record: Record<string, unknown>,
  key: string,
  path: string,
): string {
  const value = requireNonEmptyString(record, key, path);
  if (!isValidCalendarDate(value)) {
    invalid(path, 'expected a valid YYYY-MM-DD calendar date');
  }
  return value;
}

function requireCefrLevel(
  record: Record<string, unknown>,
  path: string,
): CefrLevel {
  const level = record.level;
  if (typeof level !== 'string' || !CEFR_LEVELS.includes(level as CefrLevel)) {
    invalid(path, `expected one of ${CEFR_LEVELS.join(', ')}`);
  }
  return level as CefrLevel;
}

// Only PD / CC0 / CC BY / CC BY-SA sources may be adapted and redistributed.
// ND and NC variants, all-rights-reserved and unknown licences are rejected.
const ALLOWED_SOURCE_LICENSE =
  /(^|[^a-z])(pd|public domain|cc0|cc by(-sa)?)([^a-z]|$)/i;
const FORBIDDEN_SOURCE_LICENSE =
  /(^|[^a-z])(nc|nd|nc-nd|all rights reserved|proprietary|unknown)([^a-z]|$)/i;

function isAllowedSourceLicense(value: string): boolean {
  return (
    ALLOWED_SOURCE_LICENSE.test(value) &&
    !FORBIDDEN_SOURCE_LICENSE.test(value)
  );
}

interface TranslationSource {
  paragraphs: ArticleParagraph[];
  glossary: GlossaryEntry[];
  questions: Question[];
}

function assertTranslationMap(
  value: unknown,
  expectedKeys: string[],
  path: string,
  label: string,
): asserts value is Record<string, string> {
  if (!isRecord(value)) {
    invalid(path, 'expected an object');
  }

  const expected = new Set(expectedKeys);
  const actual = Object.keys(value);
  if (
    actual.length !== expected.size ||
    actual.some((key) => !expected.has(key))
  ) {
    invalid(path, `expected keys to match the article ${label}`);
  }

  expectedKeys.forEach((key) => {
    const translation = value[key];
    if (typeof translation !== 'string' || translation.trim() === '') {
      invalid(
        `${path}[${JSON.stringify(key)}]`,
        'expected a non-empty string',
      );
    }
  });
}

function assertQuestionTexts(
  value: unknown,
  expectedIds: string[],
  path: string,
): void {
  if (!isRecord(value)) {
    invalid(path, 'expected an object');
  }

  const expected = new Set(expectedIds);
  const actual = Object.keys(value);
  if (
    actual.length !== expected.size ||
    actual.some((key) => !expected.has(key))
  ) {
    invalid(path, 'expected keys to match the article question ids');
  }

  expectedIds.forEach((id) => {
    const entry = value[id];
    const entryPath = `${path}[${JSON.stringify(id)}]`;
    if (!isRecord(entry)) {
      invalid(entryPath, 'expected an object');
    }

    requireNonEmptyString(entry, 'prompt', `${entryPath}.prompt`);

    const options = entry.options;
    if (!Array.isArray(options) || options.length !== 4) {
      invalid(`${entryPath}.options`, 'expected an array of 4 strings');
    }
    options.forEach((option, optionIndex) => {
      if (typeof option !== 'string' || option.trim() === '') {
        invalid(
          `${entryPath}.options[${optionIndex}]`,
          'expected a non-empty string',
        );
      }
    });
    if (new Set(options).size !== options.length) {
      invalid(`${entryPath}.options`, 'expected unique options');
    }
  });
}

function assertTranslation(
  value: unknown,
  path: string,
  source: TranslationSource,
): asserts value is ArticleTranslation {
  if (!isRecord(value)) {
    invalid(path, 'expected an object');
  }

  requireNonEmptyString(value, 'title', `${path}.title`);
  requireNonEmptyString(value, 'summary', `${path}.summary`);

  const paragraphs = value.paragraphs;
  if (
    !Array.isArray(paragraphs) ||
    paragraphs.length !== source.paragraphs.length
  ) {
    invalid(
      `${path}.paragraphs`,
      `expected ${source.paragraphs.length} paragraphs`,
    );
  }
  paragraphs.forEach((paragraph, paragraphIndex) => {
    const paragraphPath = `${path}.paragraphs[${paragraphIndex}]`;
    if (!isRecord(paragraph)) {
      invalid(paragraphPath, 'expected an object');
    }

    const sentences = paragraph.sentences;
    const expectedCount = source.paragraphs[paragraphIndex].sentences.length;
    if (!Array.isArray(sentences) || sentences.length !== expectedCount) {
      invalid(
        `${paragraphPath}.sentences`,
        `expected ${expectedCount} sentences`,
      );
    }
    sentences.forEach((sentence, sentenceIndex) => {
      if (typeof sentence !== 'string' || sentence.trim() === '') {
        invalid(
          `${paragraphPath}.sentences[${sentenceIndex}]`,
          'expected a non-empty string',
        );
      }
    });
  });

  assertTranslationMap(
    value.glossary,
    source.glossary.map((entry) => entry.term),
    `${path}.glossary`,
    'glossary terms',
  );
  assertTranslationMap(
    value.questions,
    source.questions.map((question) => question.id),
    `${path}.questions`,
    'question ids',
  );
  if (value.questionTexts !== undefined) {
    assertQuestionTexts(
      value.questionTexts,
      source.questions.map((question) => question.id),
      `${path}.questionTexts`,
    );
  }
}

function assertArticleIndexEntry(
  value: unknown,
  path: string,
): asserts value is ArticleIndexEntry {
  if (!isRecord(value)) {
    invalid(path, 'expected an object');
  }

  const id = requireNonEmptyString(value, 'id', `${path}.id`);
  requireNonEmptyString(value, 'title', `${path}.title`);
  requireCefrLevel(value, `${path}.level`);
  requireNonEmptyString(value, 'theme', `${path}.theme`);
  requireCalendarDate(value, 'date', `${path}.date`);
  requireNonEmptyString(value, 'summary', `${path}.summary`);

  const articlePath = requireNonEmptyString(value, 'path', `${path}.path`);
  if (articlePath !== `articles/${id}.json`) {
    invalid(
      `${path}.path`,
      `expected "articles/${id}.json" for article id "${id}"`,
    );
  }
}

function requireIntegerInRange(
  record: Record<string, unknown>,
  key: string,
  path: string,
  min: number,
  max: number,
): number {
  const value = record[key];
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    invalid(path, `expected an integer between ${min} and ${max}`);
  }
  return value;
}

function assertCommonsFilePageUrl(value: string, path: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return invalid(path, 'expected an HTTPS Commons file page URL');
  }

  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'commons.wikimedia.org' ||
    url.port !== '' ||
    url.username !== '' ||
    url.password !== ''
  ) {
    invalid(path, 'expected an HTTPS Commons file page URL');
  }
  if (url.hash !== '') {
    invalid(path, 'expected a Commons file page URL without a fragment');
  }
  if (
    !url.pathname.startsWith('/wiki/File:') ||
    url.pathname.length <= '/wiki/File:'.length
  ) {
    invalid(path, 'expected a Commons File: page URL');
  }
  if (url.search !== '') {
    const params = Array.from(url.searchParams.entries());
    if (
      params.length !== 1 ||
      params[0][0] !== 'oldid' ||
      !/^[1-9]\d*$/.test(params[0][1])
    ) {
      invalid(path, 'expected only an optional numeric oldid parameter');
    }
  }
}

function assertArticleImage(
  value: unknown,
  path: string,
): asserts value is ArticleImage {
  if (!isRecord(value)) {
    invalid(path, 'expected an object');
  }

  const imagePath = requireNonEmptyString(value, 'path', `${path}.path`);
  if (!IMAGE_PATH.test(imagePath)) {
    invalid(
      `${path}.path`,
      'expected a relative images/ path with a 12-character hash suffix',
    );
  }

  requireNonEmptyString(value, 'alt', `${path}.alt`);
  const author = requireNonEmptyString(value, 'author', `${path}.author`);
  if (author.trim().length > 120) {
    invalid(`${path}.author`, 'expected at most 120 characters');
  }

  const sourceUrl = requireNonEmptyString(
    value,
    'sourceUrl',
    `${path}.sourceUrl`,
  );
  assertCommonsFilePageUrl(sourceUrl, `${path}.sourceUrl`);

  const license = requireNonEmptyString(value, 'license', `${path}.license`);
  const expectedLicenseUrl = IMAGE_LICENSE_URLS.get(license);
  if (!expectedLicenseUrl) {
    invalid(
      `${path}.license`,
      'expected a supported public domain or Creative Commons licence',
    );
  }
  const licenseUrl = requireNonEmptyString(
    value,
    'licenseUrl',
    `${path}.licenseUrl`,
  );
  if (licenseUrl !== expectedLicenseUrl) {
    invalid(
      `${path}.licenseUrl`,
      `expected "${expectedLicenseUrl}" for licence "${license}"`,
    );
  }

  requireNonEmptyString(value, 'changes', `${path}.changes`);
  requireIntegerInRange(value, 'width', `${path}.width`, 1, 1600);
  requireIntegerInRange(value, 'height', `${path}.height`, 1, 1600);
  requireIntegerInRange(
    value,
    'byteLength',
    `${path}.byteLength`,
    1,
    1_048_576,
  );

  const sha256 = requireNonEmptyString(value, 'sha256', `${path}.sha256`);
  if (!SHA256_PATTERN.test(sha256)) {
    invalid(`${path}.sha256`, 'expected 64 lowercase hexadecimal characters');
  }
  const pathHash = /-([a-f0-9]{12})\.(?:jpg|png)$/.exec(imagePath)?.[1];
  if (pathHash !== sha256.slice(0, 12)) {
    invalid(`${path}.path`, 'expected the filename hash to match sha256');
  }

  const fileRevisionId = requireNonEmptyString(
    value,
    'fileRevisionId',
    `${path}.fileRevisionId`,
  );
  if (!/^[1-9]\d*$/.test(fileRevisionId)) {
    invalid(`${path}.fileRevisionId`, 'expected a positive integer string');
  }

  requireCalendarDate(value, 'retrievedAt', `${path}.retrievedAt`);
}

function assertArticle(value: unknown): asserts value is Article {
  if (!isRecord(value)) {
    invalid('article', 'expected an object');
  }

  requireNonEmptyString(value, 'id', 'id');
  requireNonEmptyString(value, 'title', 'title');
  requireNonEmptyString(value, 'theme', 'theme');
  requireNonEmptyString(value, 'date', 'date');
  requireNonEmptyString(value, 'summary', 'summary');
  requireCefrLevel(value, 'level');

  const paragraphs = value.paragraphs;
  if (!Array.isArray(paragraphs) || paragraphs.length === 0) {
    invalid('paragraphs', 'expected a non-empty array');
  }
  paragraphs.forEach((paragraph, paragraphIndex) => {
    const paragraphPath = `paragraphs[${paragraphIndex}]`;
    if (!isRecord(paragraph)) {
      invalid(paragraphPath, 'expected an object');
    }

    const sentences = paragraph.sentences;
    if (!Array.isArray(sentences) || sentences.length === 0) {
      invalid(`${paragraphPath}.sentences`, 'expected a non-empty array');
    }
    sentences.forEach((sentence, sentenceIndex) => {
      if (typeof sentence !== 'string' || sentence.trim() === '') {
        invalid(
          `${paragraphPath}.sentences[${sentenceIndex}]`,
          'expected a non-empty string',
        );
      }
    });
  });

  const glossary = value.glossary;
  if (!Array.isArray(glossary)) {
    invalid('glossary', 'expected an array');
  }
  const glossaryTerms = new Set<string>();
  glossary.forEach((entry, entryIndex) => {
    const glossaryPath = `glossary[${entryIndex}]`;
    if (!isRecord(entry)) {
      invalid(glossaryPath, 'expected an object');
    }
    const term = requireNonEmptyString(
      entry,
      'term',
      `${glossaryPath}.term`,
    );
    if (glossaryTerms.has(term)) {
      invalid(`${glossaryPath}.term`, `duplicate term "${term}"`);
    }
    glossaryTerms.add(term);
  });

  const questions = value.questions;
  if (!Array.isArray(questions) || questions.length === 0) {
    invalid('questions', 'expected a non-empty array');
  }
  const questionIds = new Set<string>();
  questions.forEach((question, questionIndex) => {
    const questionPath = `questions[${questionIndex}]`;
    if (!isRecord(question)) {
      invalid(questionPath, 'expected an object');
    }

    const id = requireNonEmptyString(question, 'id', `${questionPath}.id`);
    if (questionIds.has(id)) {
      invalid(`${questionPath}.id`, `duplicate question id "${id}"`);
    }
    questionIds.add(id);
    requireNonEmptyString(question, 'prompt', `${questionPath}.prompt`);

    const options = question.options;
    if (!Array.isArray(options) || options.length !== 4) {
      invalid(`${questionPath}.options`, 'expected an array of 4 strings');
    }
    options.forEach((option, optionIndex) => {
      if (typeof option !== 'string' || option.trim() === '') {
        invalid(
          `${questionPath}.options[${optionIndex}]`,
          'expected a non-empty string',
        );
      }
    });
    if (new Set(options).size !== options.length) {
      invalid(`${questionPath}.options`, 'expected unique options');
    }

    const answerIndex = question.answerIndex;
    if (
      typeof answerIndex !== 'number' ||
      !Number.isInteger(answerIndex) ||
      answerIndex < 0 ||
      answerIndex >= options.length
    ) {
      invalid(
        `${questionPath}.answerIndex`,
        'expected an integer within the options range',
      );
    }

    requireNonEmptyString(question, 'evidence', `${questionPath}.evidence`);
    if (question.explanation !== undefined) {
      requireNonEmptyString(
        question,
        'explanation',
        `${questionPath}.explanation`,
      );
    }
  });

  if (value.image !== undefined) {
    assertArticleImage(value.image, 'image');
  }

  const translations = value.translations;
  if (!isRecord(translations)) {
    invalid('translations', 'expected an object');
  }
  if (!isRecord(translations.zh)) {
    invalid('translations.zh', 'expected an object');
  }

  const translationSource: TranslationSource = {
    paragraphs: paragraphs as ArticleParagraph[],
    glossary: glossary as GlossaryEntry[],
    questions: questions as Question[],
  };
  Object.entries(translations).forEach(([locale, translation]) => {
    if (translation === undefined) return;
    assertTranslation(
      translation,
      `translations.${locale}`,
      translationSource,
    );
  });

  const source = value.source;
  if (!isRecord(source)) {
    invalid('source', 'expected an object');
  }
  requireNonEmptyString(source, 'site', 'source.site');
  requireNonEmptyString(source, 'title', 'source.title');
  requireNonEmptyString(source, 'url', 'source.url');
  const authors = source.authors;
  if (
    !Array.isArray(authors) ||
    authors.length === 0 ||
    authors.some(
      (author) => typeof author !== 'string' || author.trim() === '',
    )
  ) {
    invalid('source.authors', 'expected a non-empty array of strings');
  }
  if (source.translators !== undefined) {
    if (
      !Array.isArray(source.translators) ||
      source.translators.length === 0 ||
      source.translators.some(
        (translator) =>
          typeof translator !== 'string' || translator.trim() === '',
      )
    ) {
      invalid(
        'source.translators',
        'expected a non-empty array of strings',
      );
    }
  }
  const sourceLicense = requireNonEmptyString(
    source,
    'license',
    'source.license',
  );
  if (!isAllowedSourceLicense(sourceLicense)) {
    invalid(
      'source.license',
      `"${sourceLicense}" is not a redistributable licence; expected PD, CC0, CC BY or CC BY-SA`,
    );
  }
  requireNonEmptyString(source, 'licenseUrl', 'source.licenseUrl');
  requireNonEmptyString(source, 'retrievedAt', 'source.retrievedAt');

  if (source.publishedAt !== undefined) {
    if (
      typeof source.publishedAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(source.publishedAt)
    ) {
      invalid('source.publishedAt', 'expected YYYY-MM-DD');
    }
  }

  if (
    source.attributionPosition !== undefined &&
    source.attributionPosition !== 'top' &&
    source.attributionPosition !== 'bottom'
  ) {
    invalid('source.attributionPosition', 'expected "top" or "bottom"');
  }

  const adaptation = value.adaptation;
  if (!isRecord(adaptation)) {
    invalid('adaptation', 'expected an object');
  }
  requireNonEmptyString(adaptation, 'model', 'adaptation.model');
  requireNonEmptyString(adaptation, 'date', 'adaptation.date');
  requireNonEmptyString(adaptation, 'changes', 'adaptation.changes');
  requireNonEmptyString(adaptation, 'reviewer', 'adaptation.reviewer');

  const license = value.license;
  if (!isRecord(license)) {
    invalid('license', 'expected an object');
  }
  if (license.name !== 'CC BY-SA 4.0') {
    invalid('license.name', 'expected "CC BY-SA 4.0"');
  }
  requireNonEmptyString(license, 'url', 'license.url');
}

function contentBaseUrl(): string {
  const configured = import.meta.env.VITE_CONTENT_BASE_URL;
  const base =
    typeof configured === 'string' && configured.trim() !== ''
      ? configured.trim()
      : `${import.meta.env.BASE_URL}data/`;

  return base.endsWith('/') ? base : `${base}/`;
}

export function resolveImageUrl(path: string): string {
  if (!IMAGE_PATH.test(path)) {
    invalid(
      'image.path',
      'expected a relative images/ path with a 12-character hash suffix',
    );
  }
  return `${contentBaseUrl()}${path}`;
}

async function fetchJson<T>(relativePath: string): Promise<T> {
  const url = `${contentBaseUrl()}${relativePath}`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new ContentLoadError(`Could not fetch "${url}".`);
  }

  if (!response.ok) {
    throw new ContentLoadError(
      `Could not load "${url}" (HTTP ${response.status}).`,
    );
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ContentLoadError(`Could not parse JSON from "${url}".`);
  }
}

export async function loadManifest(): Promise<Manifest> {
  if (manifestCache) {
    return manifestCache;
  }

  const value = await fetchJson<unknown>('manifest.json');
  if (!isRecord(value) || !Array.isArray(value.days)) {
    invalid('manifest.days', 'expected an array of YYYY-MM-DD dates');
  }
  if (value.months !== undefined) {
    invalid('manifest.months', 'manifest must use days instead of months');
  }
  const seenDays = new Set<string>();
  value.days.forEach((day, position) => {
    if (typeof day !== 'string' || !isValidCalendarDate(day)) {
      invalid(
        `manifest.days[${position}]`,
        'expected a valid YYYY-MM-DD calendar date',
      );
    }
    if (seenDays.has(day)) {
      invalid(`manifest.days[${position}]`, `duplicate day "${day}"`);
    }
    seenDays.add(day);
  });

  manifestCache = { days: value.days as string[] };
  return manifestCache;
}

export async function loadDay(date: string): Promise<DayIndex> {
  const cached = dayCache.get(date);
  if (cached) {
    return cached;
  }

  const path = `days/${date}.json`;
  if (!isValidCalendarDate(date)) {
    invalid(path, 'expected a valid YYYY-MM-DD calendar date');
  }

  const value = await fetchJson<unknown>(path);
  if (!isRecord(value)) {
    invalid(path, 'expected an object');
  }
  if (typeof value.date !== 'string' || !isValidCalendarDate(value.date)) {
    invalid('date', 'expected a valid YYYY-MM-DD calendar date');
  }
  if (value.date !== date) {
    invalid(
      'date',
      `expected "${value.date}" to match the requested day "${date}"`,
    );
  }
  const articles = value.articles;
  if (!Array.isArray(articles)) {
    invalid('articles', 'expected an array');
  }
  articles.forEach((entry, entryIndex) => {
    const entryPath = `articles[${entryIndex}]`;
    assertArticleIndexEntry(entry, entryPath);
    if (entry.date !== value.date) {
      invalid(
        `${entryPath}.date`,
        `expected "${entry.date}" to match the day index date "${value.date}"`,
      );
    }
  });

  const result: DayIndex = {
    date: value.date,
    articles: articles as DayIndex['articles'],
  };
  dayCache.set(date, result);
  return result;
}

export async function loadArticle(path: string): Promise<Article> {
  const value = await fetchJson<unknown>(path);
  assertArticle(value);
  return value;
}

function dateHintFromId(id: string): string | undefined {
  const match = /^(\d{4}-\d{2}-\d{2})-/.exec(id);
  if (!match) {
    return undefined;
  }
  return isValidCalendarDate(match[1]) ? match[1] : undefined;
}

function findCachedEntry(id: string): ArticleIndexEntry | undefined {
  for (const index of dayCache.values()) {
    const entry = index.articles.find((article) => article.id === id);
    if (entry) {
      return entry;
    }
  }
  return undefined;
}

async function findEntryInDay(
  day: string,
  id: string,
): Promise<ArticleIndexEntry | undefined> {
  const index = await loadDay(day);
  return index.articles.find((entry) => entry.id === id);
}

export async function resolveArticleById(id: string): Promise<Article> {
  const cachedEntry = findCachedEntry(id);
  if (cachedEntry) {
    return loadArticle(cachedEntry.path);
  }

  const manifest = await loadManifest();
  const hint = dateHintFromId(id);
  const hintedDay = hint && manifest.days.includes(hint) ? hint : undefined;

  if (hintedDay) {
    const entry = await findEntryInDay(hintedDay, id);
    if (entry) {
      return loadArticle(entry.path);
    }
  }

  for (const day of manifest.days) {
    if (day === hintedDay) {
      continue;
    }
    const entry = await findEntryInDay(day, id);
    if (entry) {
      return loadArticle(entry.path);
    }
  }

  throw new ContentLoadError(`Article "${id}" was not found in the manifest.`);
}
