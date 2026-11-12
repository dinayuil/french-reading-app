import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cwd } from 'node:process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  Article,
  ArticleIndexEntry,
  DayIndex,
} from '../types/content';

const articlePath = 'articles/2026-11-09-tour-eiffel.json';

const indexEntry: ArticleIndexEntry = {
  id: '2026-11-09-tour-eiffel',
  title: 'La tour Eiffel',
  level: 'B1',
  theme: 'culture',
  date: '2026-11-09',
  summary: 'Un article de test sur la tour Eiffel.',
  path: articlePath,
};

const dayPath = 'days/2026-11-09.json';

const dayIndex: DayIndex = {
  date: '2026-11-09',
  articles: [indexEntry],
};

const undatedEntry: ArticleIndexEntry = {
  ...indexEntry,
  id: 'tour-eiffel',
  path: 'articles/tour-eiffel.json',
};

const validArticle: Article = {
  id: '2026-11-09-tour-eiffel',
  title: 'La tour Eiffel',
  level: 'B1',
  theme: 'culture',
  date: '2026-11-09',
  summary: 'Un article de test sur la tour Eiffel.',
  paragraphs: [
    {
      sentences: [
        'La tour Eiffel se trouve à Paris.',
        'Elle est très célèbre.',
      ],
    },
  ],
  glossary: [{ term: 'situé' }],
  questions: [
    {
      id: 'q1',
      prompt: 'Où se trouve la tour Eiffel ?',
      options: ['À Paris', 'À Lyon', 'À Nice', 'À Lille'],
      answerIndex: 0,
      evidence: 'La tour Eiffel se trouve à Paris.',
    },
  ],
  translations: {
    zh: {
      title: '埃菲尔铁塔',
      summary: '一篇关于埃菲尔铁塔的测试文章。',
      paragraphs: [
        {
          sentences: ['埃菲尔铁塔位于巴黎。', '它非常有名。'],
        },
      ],
      glossary: { situé: '位于，坐落在' },
      questions: { q1: '文章说明铁塔位于巴黎。' },
    },
  },
  source: {
    site: 'Wikipédia en français',
    title: 'Tour Eiffel',
    authors: ['Contributeurs de Wikipédia'],
    url: 'https://fr.wikipedia.org/w/index.php?oldid=241075004',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    retrievedAt: '2026-11-09',
    revisionId: '241075004',
  },
  adaptation: {
    model: 'rédaction interne (échantillon)',
    date: '2026-11-09',
    changes: 'Texte simplifié au niveau B1.',
    reviewer: 'révision éditoriale',
  },
  license: {
    name: 'CC BY-SA 4.0',
    url: 'https://creativecommons.org/licenses/by-sa/4.0/',
  },
};

interface MockRoute {
  status?: number;
  body?: unknown;
}

function stubFetch(routes: Record<string, MockRoute>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const route = routes[url];
    const status = route?.status ?? (route ? 200 : 404);

    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => route?.body,
    } as Response;
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function loadContentModule() {
  vi.resetModules();
  return import('./content');
}

function cloneArticlePayload() {
  return JSON.parse(JSON.stringify(validArticle)) as Record<string, unknown>;
}

function translationPayload(payload: Record<string, unknown>) {
  const translations = payload.translations as Record<string, unknown>;
  return translations.zh as Record<string, unknown>;
}

async function expectArticleValidationError(
  payload: unknown,
  expectedPath: string,
) {
  stubFetch({ [`/data/${articlePath}`]: { body: payload } });
  const { loadArticle, ContentValidationError } = await loadContentModule();

  const error: unknown = await loadArticle(articlePath).catch((e: unknown) => e);

  expect(error).toBeInstanceOf(ContentValidationError);
  expect((error as Error).message).toContain(expectedPath);
}

async function expectDayValidationError(
  body: unknown,
  expectedPath: string,
  date = '2026-11-09',
) {
  stubFetch({ [`/data/days/${date}.json`]: { body } });
  const { loadDay, ContentValidationError } = await loadContentModule();

  const error: unknown = await loadDay(date).catch((e: unknown) => e);

  expect(error).toBeInstanceOf(ContentValidationError);
  expect((error as Error).message).toContain(expectedPath);
}

async function expectInvalidAnswerIndex(answerIndex: number) {
  const payload = cloneArticlePayload();
  const questions = payload.questions as Array<Record<string, unknown>>;
  questions[0].answerIndex = answerIndex;

  await expectArticleValidationError(
    payload,
    'questions[0].answerIndex',
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('content loader', () => {
  it('loads and parses the manifest', async () => {
    const fetchMock = stubFetch({
      '/data/manifest.json': { body: { days: ['2026-11-09'] } },
    });
    const { loadManifest } = await loadContentModule();

    await expect(loadManifest()).resolves.toEqual({ days: ['2026-11-09'] });
    expect(fetchMock).toHaveBeenCalledWith('/data/manifest.json');
  });

  it('rejects a manifest that only provides months', async () => {
    stubFetch({
      '/data/manifest.json': { body: { months: ['2026-11'] } },
    });
    const { loadManifest, ContentValidationError } = await loadContentModule();

    const error: unknown = await loadManifest().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ContentValidationError);
    expect((error as Error).message).toContain('manifest.days');
  });

  it('rejects a manifest that still mixes days with months', async () => {
    stubFetch({
      '/data/manifest.json': {
        body: { days: ['2026-11-09'], months: ['2026-11'] },
      },
    });
    const { loadManifest, ContentValidationError } = await loadContentModule();

    const error: unknown = await loadManifest().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ContentValidationError);
    expect((error as Error).message).toContain('manifest.months');
  });

  it('rejects duplicate manifest days', async () => {
    stubFetch({
      '/data/manifest.json': {
        body: { days: ['2026-11-09', '2026-11-09'] },
      },
    });
    const { loadManifest, ContentValidationError } = await loadContentModule();

    const error: unknown = await loadManifest().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ContentValidationError);
    expect((error as Error).message).toContain('manifest.days[1]');
  });

  it('rejects a manifest day that is not a valid calendar date', async () => {
    stubFetch({
      '/data/manifest.json': { body: { days: ['2026-02-30'] } },
    });
    const { loadManifest, ContentValidationError } = await loadContentModule();

    const error: unknown = await loadManifest().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ContentValidationError);
    expect((error as Error).message).toContain('manifest.days[0]');
  });

  it('loads and parses a day index', async () => {
    const fetchMock = stubFetch({
      [`/data/${dayPath}`]: { body: dayIndex },
    });
    const { loadDay } = await loadContentModule();

    await expect(loadDay('2026-11-09')).resolves.toEqual(dayIndex);
    expect(fetchMock).toHaveBeenCalledWith(`/data/${dayPath}`);
  });

  it('caches a day index after the first load', async () => {
    const fetchMock = stubFetch({
      [`/data/${dayPath}`]: { body: dayIndex },
    });
    const { loadDay } = await loadContentModule();

    const first = await loadDay('2026-11-09');
    const second = await loadDay('2026-11-09');

    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid calendar date before fetching a day index', async () => {
    const fetchMock = stubFetch({});
    const { loadDay, ContentValidationError } = await loadContentModule();

    const error: unknown = await loadDay('2026-02-30').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ContentValidationError);
    expect((error as Error).message).toContain('days/2026-02-30');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a day index whose date does not match the requested day', async () => {
    await expectDayValidationError(
      { date: '2026-11-10', articles: [indexEntry] },
      'date',
    );
  });

  it('rejects a day index with an invalid calendar date', async () => {
    await expectDayValidationError({ date: '2026-02-30', articles: [] }, 'date');
  });

  it('rejects a day index entry whose date does not match the day', async () => {
    await expectDayValidationError(
      {
        date: '2026-11-09',
        articles: [{ ...indexEntry, date: '2026-11-10' }],
      },
      'articles[0].date',
    );
  });

  it('rejects a day index entry with an invalid calendar date', async () => {
    await expectDayValidationError(
      {
        date: '2026-11-09',
        articles: [{ ...indexEntry, date: '2026-02-30' }],
      },
      'articles[0].date',
    );
  });

  it('rejects a day entry whose path does not match its id', async () => {
    await expectDayValidationError(
      {
        date: '2026-11-09',
        articles: [{ ...indexEntry, path: 'articles/other.json' }],
      },
      'articles[0].path',
    );
  });

  it('loads an article with source, adaptation and license metadata', async () => {
    stubFetch({ [`/data/${articlePath}`]: { body: validArticle } });
    const { loadArticle } = await loadContentModule();

    const article = await loadArticle(articlePath);

    expect(article.id).toBe('2026-11-09-tour-eiffel');
    expect(article.source.authors).toEqual(['Contributeurs de Wikipédia']);
    expect(article.source.revisionId).toBe('241075004');
    expect(article.adaptation.date).toBe('2026-11-09');
    expect(article.license).toEqual({
      name: 'CC BY-SA 4.0',
      url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    });
  });

  it('loads an article with French source and Chinese translations', async () => {
    stubFetch({ [`/data/${articlePath}`]: { body: validArticle } });
    const { loadArticle } = await loadContentModule();

    const article = await loadArticle(articlePath);

    expect(article.title).toBe('La tour Eiffel');
    expect(article.paragraphs[0].sentences[0]).toContain('La tour Eiffel');
    expect(article.translations.zh.title).toBe('埃菲尔铁塔');
    expect(article.translations.zh.glossary['situé']).toBe('位于，坐落在');
    expect(article.translations.zh.questions['q1']).toContain('巴黎');
  });

  it('rejects an article without translations.zh', async () => {
    const payload = cloneArticlePayload();
    const translations = payload.translations as Record<string, unknown>;
    delete translations.zh;

    await expectArticleValidationError(payload, 'translations.zh');
  });

  it('rejects mismatched translation paragraph count', async () => {
    const payload = cloneArticlePayload();
    const paragraphs = payload.paragraphs as Array<Record<string, unknown>>;
    paragraphs.push({ sentences: ['Une autre phrase.'] });

    await expectArticleValidationError(payload, 'translations.zh.paragraphs');
  });

  it('rejects mismatched translation sentence count', async () => {
    const payload = cloneArticlePayload();
    const paragraphs = payload.paragraphs as Array<Record<string, unknown>>;
    const sentences = paragraphs[0].sentences as string[];
    sentences.push('Une phrase en plus.');

    await expectArticleValidationError(
      payload,
      'translations.zh.paragraphs[0].sentences',
    );
  });

  it('rejects a glossary translation key mismatch', async () => {
    const payload = cloneArticlePayload();
    const glossary = translationPayload(payload).glossary as Record<
      string,
      string
    >;
    delete glossary.situé;

    await expectArticleValidationError(payload, 'translations.zh.glossary');
  });

  it('rejects a question translation key mismatch', async () => {
    const payload = cloneArticlePayload();
    const questions = translationPayload(payload).questions as Record<
      string,
      string
    >;
    delete questions.q1;

    await expectArticleValidationError(payload, 'translations.zh.questions');
  });

  it('rejects a duplicate glossary term', async () => {
    const payload = cloneArticlePayload();
    const glossary = payload.glossary as Array<Record<string, unknown>>;
    glossary.push({ term: 'situé' });

    await expectArticleValidationError(payload, 'glossary[1].term');
  });

  it('rejects a duplicate question id', async () => {
    const payload = cloneArticlePayload();
    const questions = payload.questions as Array<Record<string, unknown>>;
    questions.push({ ...questions[0] });

    await expectArticleValidationError(payload, 'questions[1].id');
  });

  it('rejects an article payload that has no license block', async () => {
    const payload = cloneArticlePayload();
    delete payload.license;

    await expectArticleValidationError(payload, 'license');
  });

  it('rejects an article payload with no summary', async () => {
    const payload = cloneArticlePayload();
    delete payload.summary;

    await expectArticleValidationError(payload, 'summary');
  });

  it('rejects an article payload with no source license', async () => {
    const payload = cloneArticlePayload();
    const source = payload.source as Record<string, unknown>;
    delete source.license;

    await expectArticleValidationError(payload, 'source.license');
  });

  it('rejects an article whose source license forbids derivatives', async () => {
    const payload = cloneArticlePayload();
    const source = payload.source as Record<string, unknown>;
    source.license = 'CC BY-ND';

    await expectArticleValidationError(payload, 'source.license');
  });

  it('rejects an article whose source license is all rights reserved', async () => {
    const payload = cloneArticlePayload();
    const source = payload.source as Record<string, unknown>;
    source.license = 'All rights reserved';

    await expectArticleValidationError(payload, 'source.license');
  });

  it('accepts optional source publication metadata', async () => {
    const payload = cloneArticlePayload();
    const source = payload.source as Record<string, unknown>;
    source.publishedAt = '2026-11-08';
    source.attributionPosition = 'top';
    stubFetch({ [`/data/${articlePath}`]: { body: payload } });
    const { loadArticle } = await loadContentModule();

    await expect(loadArticle(articlePath)).resolves.toMatchObject({
      source: { publishedAt: '2026-11-08', attributionPosition: 'top' },
    });
  });

  it('rejects an invalid source.publishedAt', async () => {
    const payload = cloneArticlePayload();
    const source = payload.source as Record<string, unknown>;
    source.publishedAt = '08/11/2026';

    await expectArticleValidationError(payload, 'source.publishedAt');
  });

  it('rejects an invalid source.attributionPosition', async () => {
    const payload = cloneArticlePayload();
    const source = payload.source as Record<string, unknown>;
    source.attributionPosition = 'middle';

    await expectArticleValidationError(payload, 'source.attributionPosition');
  });

  it('rejects a question with a negative answerIndex', async () => {
    await expectInvalidAnswerIndex(-1);
  });

  it('rejects a question with an out-of-range answerIndex', async () => {
    await expectInvalidAnswerIndex(4);
  });

  it('rejects a question with a non-integer answerIndex', async () => {
    await expectInvalidAnswerIndex(1.5);
  });

  it('rejects a question with a non-string option', async () => {
    const payload = cloneArticlePayload();
    const questions = payload.questions as Array<Record<string, unknown>>;
    const options = questions[0].options as unknown[];
    options[1] = 42;

    await expectArticleValidationError(payload, 'questions[0].options[1]');
  });

  it('resolves an article by id through manifest, day and article files', async () => {
    const fetchMock = stubFetch({
      '/data/manifest.json': { body: { days: ['2026-11-09'] } },
      [`/data/${dayPath}`]: { body: dayIndex },
      [`/data/${articlePath}`]: { body: validArticle },
    });
    const { resolveArticleById } = await loadContentModule();

    await expect(
      resolveArticleById('2026-11-09-tour-eiffel'),
    ).resolves.toMatchObject({ id: '2026-11-09-tour-eiffel' });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/data/manifest.json',
      `/data/${dayPath}`,
      `/data/${articlePath}`,
    ]);
  });

  it('resolves an article whose id has no date prefix', async () => {
    const payload = cloneArticlePayload();
    payload.id = 'tour-eiffel';
    const fetchMock = stubFetch({
      '/data/manifest.json': { body: { days: ['2026-11-09'] } },
      [`/data/${dayPath}`]: {
        body: { date: '2026-11-09', articles: [undatedEntry] },
      },
      '/data/articles/tour-eiffel.json': { body: payload },
    });
    const { resolveArticleById } = await loadContentModule();

    await expect(resolveArticleById('tour-eiffel')).resolves.toMatchObject({
      id: 'tour-eiffel',
    });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/data/manifest.json',
      `/data/${dayPath}`,
      '/data/articles/tour-eiffel.json',
    ]);
  });

  it('throws a load error when no day indexes the requested id', async () => {
    stubFetch({
      '/data/manifest.json': { body: { days: ['2026-11-09'] } },
      [`/data/${dayPath}`]: { body: dayIndex },
    });
    const { resolveArticleById, ContentLoadError } = await loadContentModule();

    await expect(resolveArticleById('inconnu')).rejects.toBeInstanceOf(
      ContentLoadError,
    );
  });

  it('loads the day hinted by a dated id before scanning other days', async () => {
    const fetchMock = stubFetch({
      '/data/manifest.json': { body: { days: ['2026-11-10', '2026-11-09'] } },
      '/data/days/2026-11-10.json': {
        body: { date: '2026-11-10', articles: [] },
      },
      [`/data/${dayPath}`]: { body: dayIndex },
      [`/data/${articlePath}`]: { body: validArticle },
    });
    const { resolveArticleById } = await loadContentModule();

    await expect(
      resolveArticleById('2026-11-09-tour-eiffel'),
    ).resolves.toMatchObject({ id: '2026-11-09-tour-eiffel' });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/data/manifest.json',
      `/data/${dayPath}`,
      `/data/${articlePath}`,
    ]);
  });

  it('falls back to other days without refetching the hinted day', async () => {
    const fallbackDayPath = 'days/2026-11-10.json';
    const fallbackEntry: ArticleIndexEntry = {
      ...indexEntry,
      date: '2026-11-10',
    };
    const fetchMock = stubFetch({
      '/data/manifest.json': { body: { days: ['2026-11-10', '2026-11-09'] } },
      [`/data/${dayPath}`]: {
        body: { date: '2026-11-09', articles: [] },
      },
      [`/data/${fallbackDayPath}`]: {
        body: { date: '2026-11-10', articles: [fallbackEntry] },
      },
      [`/data/${articlePath}`]: { body: validArticle },
    });
    const { resolveArticleById } = await loadContentModule();

    await expect(
      resolveArticleById('2026-11-09-tour-eiffel'),
    ).resolves.toMatchObject({ id: '2026-11-09-tour-eiffel' });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/data/manifest.json',
      `/data/${dayPath}`,
      `/data/${fallbackDayPath}`,
      `/data/${articlePath}`,
    ]);
  });

  it('scans undated ids in order and stops at the first matching day', async () => {
    const payload = cloneArticlePayload();
    payload.id = 'tour-eiffel';
    const secondDayPath = 'days/2026-11-10.json';
    const secondEntry: ArticleIndexEntry = {
      ...undatedEntry,
      date: '2026-11-10',
    };
    const fetchMock = stubFetch({
      '/data/manifest.json': {
        body: { days: ['2026-11-09', '2026-11-10', '2026-11-11'] },
      },
      '/data/days/2026-11-09.json': {
        body: { date: '2026-11-09', articles: [] },
      },
      [`/data/${secondDayPath}`]: {
        body: { date: '2026-11-10', articles: [secondEntry] },
      },
      '/data/articles/tour-eiffel.json': { body: payload },
    });
    const { resolveArticleById } = await loadContentModule();

    await expect(resolveArticleById('tour-eiffel')).resolves.toMatchObject({
      id: 'tour-eiffel',
    });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/data/manifest.json',
      '/data/days/2026-11-09.json',
      `/data/${secondDayPath}`,
      '/data/articles/tour-eiffel.json',
    ]);
  });

  it('serves a cached day entry without reloading the manifest', async () => {
    const fetchMock = stubFetch({
      [`/data/${dayPath}`]: { body: dayIndex },
      [`/data/${articlePath}`]: { body: validArticle },
    });
    const { loadDay, resolveArticleById } = await loadContentModule();

    await loadDay('2026-11-09');
    await expect(
      resolveArticleById('2026-11-09-tour-eiffel'),
    ).resolves.toMatchObject({ id: '2026-11-09-tour-eiffel' });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `/data/${dayPath}`,
      `/data/${articlePath}`,
    ]);
  });

  it('rejects with ContentLoadError on a 404 response', async () => {
    stubFetch({});
    const { loadArticle, ContentLoadError } = await loadContentModule();

    await expect(loadArticle(articlePath)).rejects.toBeInstanceOf(
      ContentLoadError,
    );
  });

  it('builds fetch paths from the Vite base URL', async () => {
    const fetchMock = stubFetch({
      '/data/manifest.json': { body: { days: ['2026-11-09'] } },
    });
    const { loadManifest } = await loadContentModule();

    await loadManifest();

    // The test base is '/', so the data path starts at /data/.
    expect(fetchMock).toHaveBeenCalledWith('/data/manifest.json');
  });

  it('uses VITE_CONTENT_BASE_URL when configured', async () => {
    vi.stubEnv(
      'VITE_CONTENT_BASE_URL',
      'https://content.example/base',
    );
    const fetchMock = stubFetch({
      'https://content.example/base/manifest.json': {
        body: { days: ['2026-11-09'] },
      },
    });
    const { loadManifest } = await loadContentModule();

    await loadManifest();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://content.example/base/manifest.json',
    );
  });
});

describe('sample Tour Eiffel content', () => {
  it('keeps evidence verbatim and spreads correct answers across positions', () => {
    const article = JSON.parse(
      readFileSync(
        resolve(cwd(), 'src/test/fixtures/tour-eiffel.json'),
        'utf8',
      ),
    ) as Article;

    const sentences = article.paragraphs.flatMap(
      (paragraph) => paragraph.sentences,
    );

    for (const question of article.questions) {
      expect(sentences).toContain(question.evidence);
    }

    const answerPositions = new Set(
      article.questions.map((question) => question.answerIndex),
    );
    expect(answerPositions.size).toBeGreaterThanOrEqual(3);
  });

  it('keeps the Chinese translation aligned with the French source', () => {
    const article = JSON.parse(
      readFileSync(
        resolve(cwd(), 'src/test/fixtures/tour-eiffel.json'),
        'utf8',
      ),
    ) as Article;

    const translation = article.translations.zh;

    expect(translation.paragraphs).toHaveLength(article.paragraphs.length);
    translation.paragraphs.forEach((paragraph, paragraphIndex) => {
      expect(paragraph.sentences).toHaveLength(
        article.paragraphs[paragraphIndex].sentences.length,
      );
    });
    expect(Object.keys(translation.glossary).sort()).toEqual(
      article.glossary.map((entry) => entry.term).sort(),
    );
    expect(Object.keys(translation.questions).sort()).toEqual(
      article.questions.map((question) => question.id).sort(),
    );
  });
});
