import type {
  Article,
  ArticleIndexEntry,
  ArticleParagraph,
  ArticleTranslation,
  CefrLevel,
  GlossaryEntry,
  Manifest,
  MonthIndex,
  Question,
} from '../types/content';

const CEFR_LEVELS: readonly CefrLevel[] = ['A2', 'B1', 'B2'];

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
const monthCache = new Map<string, MonthIndex>();

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
  requireNonEmptyString(value, 'date', `${path}.date`);
  requireNonEmptyString(value, 'summary', `${path}.summary`);

  const articlePath = requireNonEmptyString(value, 'path', `${path}.path`);
  if (articlePath !== `articles/${id}.json`) {
    invalid(
      `${path}.path`,
      `expected "articles/${id}.json" for article id "${id}"`,
    );
  }
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
  });

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
  if (
    !isRecord(value) ||
    !Array.isArray(value.months) ||
    !value.months.every((month) => typeof month === 'string')
  ) {
    invalid('manifest.months', 'expected an array of strings');
  }

  manifestCache = { months: value.months as string[] };
  return manifestCache;
}

export async function loadMonth(month: string): Promise<MonthIndex> {
  const cached = monthCache.get(month);
  if (cached) {
    return cached;
  }

  const value = await fetchJson<unknown>(`months/${month}.json`);
  if (!isRecord(value)) {
    invalid(`months/${month}`, 'expected an object');
  }
  if (typeof value.month !== 'string' || value.month.trim() === '') {
    invalid('month', 'expected a non-empty string');
  }
  const articles = value.articles;
  if (!Array.isArray(articles)) {
    invalid('articles', 'expected an array');
  }
  articles.forEach((entry, entryIndex) => {
    assertArticleIndexEntry(entry, `articles[${entryIndex}]`);
  });

  const result: MonthIndex = {
    month: value.month,
    articles: articles as MonthIndex['articles'],
  };
  monthCache.set(month, result);
  return result;
}

export async function loadArticle(path: string): Promise<Article> {
  const value = await fetchJson<unknown>(path);
  assertArticle(value);
  return value;
}

export async function resolveArticleById(id: string): Promise<Article> {
  const manifest = await loadManifest();

  for (const month of manifest.months) {
    const index = await loadMonth(month);
    const entry = index.articles.find((article) => article.id === id);
    if (entry) {
      return loadArticle(entry.path);
    }
  }

  throw new ContentLoadError(`Article "${id}" was not found in the manifest.`);
}
