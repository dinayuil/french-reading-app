import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cwd } from 'node:process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  Article,
  ArticleImage,
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

const validImage: ArticleImage = {
  path: 'images/2026-11-09-tour-eiffel-0123456789ab.jpg',
  alt: 'La tour Eiffel vue depuis le Champ-de-Mars',
  author: 'Jane Doe',
  sourceUrl:
    'https://commons.wikimedia.org/wiki/File:Tour_Eiffel_Champ_de_Mars.jpg?oldid=123456789',
  license: 'CC BY-SA 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  changes: 'Image redimensionnée à 1200 px de large.',
  width: 1200,
  height: 800,
  byteLength: 345_678,
  sha256: '0123456789abcdef'.repeat(4),
  fileRevisionId: '123456789',
  retrievedAt: '2026-11-14',
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

function validQuestionTexts() {
  return {
    q1: {
      prompt: 'Où se trouve la tour Eiffel ?',
      options: ['À Paris', 'À Lyon', 'À Nice', 'À Lille'],
    },
  };
}

async function expectArticleValidationError(
  payload: unknown,
  expectedPath: string,
  label?: string,
) {
  stubFetch({ [`/data/${articlePath}`]: { body: payload } });
  const { loadArticle, ContentValidationError } = await loadContentModule();

  const error: unknown = await loadArticle(articlePath).catch((e: unknown) => e);

  expect(error, label).toBeInstanceOf(ContentValidationError);
  expect((error as Error).message, label).toContain(expectedPath);
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

function cloneImagePayload() {
  return JSON.parse(JSON.stringify(validImage)) as Record<string, unknown>;
}

async function expectImageValidationError(
  mutate: (image: Record<string, unknown>) => void,
  expectedPath: string,
  label?: string,
) {
  const payload = cloneArticlePayload();
  const image = cloneImagePayload();
  mutate(image);
  payload.image = image;

  await expectArticleValidationError(payload, expectedPath, label);
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
    expect(article.source.translators).toBeUndefined();
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

  it('loads a French explanation and complete Chinese question texts', async () => {
    const payload = cloneArticlePayload();
    const questions = payload.questions as Array<Record<string, unknown>>;
    questions[0].explanation =
      'Le texte indique que la tour Eiffel se trouve à Paris.';
    translationPayload(payload).questionTexts = validQuestionTexts();
    stubFetch({ [`/data/${articlePath}`]: { body: payload } });
    const { loadArticle } = await loadContentModule();

    const article = await loadArticle(articlePath);

    expect(article.questions[0].explanation).toBe(
      'Le texte indique que la tour Eiffel se trouve à Paris.',
    );
    expect(article.translations.zh.questionTexts).toEqual(
      validQuestionTexts(),
    );
  });

  it('accepts a legacy article without explanation and question texts', async () => {
    stubFetch({ [`/data/${articlePath}`]: { body: validArticle } });
    const { loadArticle } = await loadContentModule();

    const article = await loadArticle(articlePath);

    expect(article.questions[0].explanation).toBeUndefined();
    expect(article.translations.zh.questionTexts).toBeUndefined();
  });

  it('rejects an empty question explanation', async () => {
    const payload = cloneArticlePayload();
    const questions = payload.questions as Array<Record<string, unknown>>;
    questions[0].explanation = '   ';

    await expectArticleValidationError(
      payload,
      'questions[0].explanation',
    );
  });

  it('rejects a non-string question explanation', async () => {
    const payload = cloneArticlePayload();
    const questions = payload.questions as Array<Record<string, unknown>>;
    questions[0].explanation = 42;

    await expectArticleValidationError(
      payload,
      'questions[0].explanation',
    );
  });

  it('rejects question texts that omit a question id', async () => {
    const payload = cloneArticlePayload();
    translationPayload(payload).questionTexts = {};

    await expectArticleValidationError(
      payload,
      'translations.zh.questionTexts',
    );
  });

  it('rejects question texts with an extra question id', async () => {
    const payload = cloneArticlePayload();
    translationPayload(payload).questionTexts = {
      ...validQuestionTexts(),
      q2: validQuestionTexts().q1,
    };

    await expectArticleValidationError(
      payload,
      'translations.zh.questionTexts',
    );
  });

  it('rejects question texts with an empty prompt', async () => {
    const payload = cloneArticlePayload();
    const questionTexts = validQuestionTexts();
    questionTexts.q1.prompt = '';
    translationPayload(payload).questionTexts = questionTexts;

    await expectArticleValidationError(
      payload,
      'translations.zh.questionTexts["q1"].prompt',
    );
  });

  it('rejects translated options that are not exactly four', async () => {
    const payload = cloneArticlePayload();
    const questionTexts = validQuestionTexts();
    questionTexts.q1.options = ['À Paris', 'À Lyon', 'À Nice'];
    translationPayload(payload).questionTexts = questionTexts;

    await expectArticleValidationError(
      payload,
      'translations.zh.questionTexts["q1"].options',
    );
  });

  it('rejects duplicate translated options', async () => {
    const payload = cloneArticlePayload();
    const questionTexts = validQuestionTexts();
    questionTexts.q1.options = ['À Paris', 'À Paris', 'À Nice', 'À Lille'];
    translationPayload(payload).questionTexts = questionTexts;

    await expectArticleValidationError(
      payload,
      'translations.zh.questionTexts["q1"].options',
    );
  });

  it('rejects an empty translated option', async () => {
    const payload = cloneArticlePayload();
    const questionTexts = validQuestionTexts();
    questionTexts.q1.options[2] = ' ';
    translationPayload(payload).questionTexts = questionTexts;

    await expectArticleValidationError(
      payload,
      'translations.zh.questionTexts["q1"].options[2]',
    );
  });

  it('rejects a non-string translated option', async () => {
    const payload = cloneArticlePayload();
    const questionTexts = validQuestionTexts();
    (questionTexts.q1.options as unknown[])[1] = 42;
    translationPayload(payload).questionTexts = questionTexts;

    await expectArticleValidationError(
      payload,
      'translations.zh.questionTexts["q1"].options[1]',
    );
  });

  it('rejects question text entries that are not objects', async () => {
    const payload = cloneArticlePayload();
    translationPayload(payload).questionTexts = { q1: 'traduction' };

    await expectArticleValidationError(
      payload,
      'translations.zh.questionTexts["q1"]',
    );
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

  it('accepts a complete optional article image', async () => {
    const payload = cloneArticlePayload();
    payload.image = cloneImagePayload();
    stubFetch({ [`/data/${articlePath}`]: { body: payload } });
    const { loadArticle } = await loadContentModule();

    const article = await loadArticle(articlePath);

    expect(article.image).toEqual(validImage);
  });

  it('accepts a public domain image with the canonical PDM URL', async () => {
    const payload = cloneArticlePayload();
    const image = cloneImagePayload();
    image.license = 'Public domain';
    image.licenseUrl = 'https://creativecommons.org/publicdomain/mark/1.0/';
    payload.image = image;
    stubFetch({ [`/data/${articlePath}`]: { body: payload } });
    const { loadArticle } = await loadContentModule();

    const article = await loadArticle(articlePath);

    expect(article.image).toMatchObject({
      license: 'Public domain',
      licenseUrl: 'https://creativecommons.org/publicdomain/mark/1.0/',
    });
  });

  it('accepts an article without an image', async () => {
    stubFetch({ [`/data/${articlePath}`]: { body: validArticle } });
    const { loadArticle } = await loadContentModule();

    const article = await loadArticle(articlePath);

    expect(article.image).toBeUndefined();
  });

  it('rejects a null article image', async () => {
    const payload = cloneArticlePayload();
    payload.image = null;

    await expectArticleValidationError(payload, 'image');
  });

  it('rejects an incomplete article image', async () => {
    await expectImageValidationError((image) => {
      delete image.alt;
    }, 'image.alt');
  });

  it('rejects an image path outside images/', async () => {
    await expectImageValidationError((image) => {
      image.path = '../images/2026-11-09-tour-eiffel-0123456789ab.jpg';
    }, 'image.path');
  });

  it('rejects an image path with a query parameter', async () => {
    await expectImageValidationError((image) => {
      image.path =
        'images/2026-11-09-tour-eiffel-0123456789ab.jpg?download=1';
    }, 'image.path');
  });

  it('rejects an image path whose hash suffix does not match sha256', async () => {
    await expectImageValidationError((image) => {
      image.path = 'images/2026-11-09-tour-eiffel-ffffffffffff.jpg';
    }, 'image.path');
  });

  it('rejects an invalid image sha256', async () => {
    await expectImageValidationError((image) => {
      image.sha256 = '0123456789AB'.toLowerCase().repeat(4);
    }, 'image.sha256');
  });

  it('rejects an image author longer than 120 characters', async () => {
    await expectImageValidationError((image) => {
      image.author = 'a'.repeat(121);
    }, 'image.author');
  });

  it('rejects a source URL that is not a Commons file page', async () => {
    await expectImageValidationError((image) => {
      image.sourceUrl = 'https://example.com/wiki/File:Tour_Eiffel.jpg';
    }, 'image.sourceUrl');
  });

  it('rejects an unsupported image license', async () => {
    await expectImageValidationError((image) => {
      image.license = 'CC BY-ND 4.0';
      image.licenseUrl = 'https://creativecommons.org/licenses/by-nd/4.0/';
    }, 'image.license');
  });

  it('rejects an image license URL that does not match the license', async () => {
    await expectImageValidationError((image) => {
      image.licenseUrl = 'https://creativecommons.org/licenses/by/4.0/';
    }, 'image.licenseUrl');
  });

  it('rejects arbitrary public domain labels and non-canonical PDM URLs', async () => {
    const pdmUrl = 'https://creativecommons.org/publicdomain/mark/1.0/';
    const cases: Array<[string, Record<string, string>, string]> = [
      [
        'arbitrary PD label',
        { license: 'PD', licenseUrl: pdmUrl },
        'image.license',
      ],
      [
        'lowercase public domain label',
        { license: 'public domain', licenseUrl: pdmUrl },
        'image.license',
      ],
      [
        'unknown license',
        { license: 'Unknown', licenseUrl: pdmUrl },
        'image.license',
      ],
      [
        'unsupported old CC version',
        {
          license: 'CC BY 1.0',
          licenseUrl: 'https://creativecommons.org/licenses/by/1.0/',
        },
        'image.license',
      ],
      [
        'Public domain with CC0 URL',
        {
          license: 'Public domain',
          licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
        },
        'image.licenseUrl',
      ],
      [
        'Public domain with mismatched URL',
        {
          license: 'Public domain',
          licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
        },
        'image.licenseUrl',
      ],
      [
        'Public domain with PDM query',
        { license: 'Public domain', licenseUrl: `${pdmUrl}?x=1` },
        'image.licenseUrl',
      ],
      [
        'Public domain with PDM deed',
        { license: 'Public domain', licenseUrl: `${pdmUrl}deed.en` },
        'image.licenseUrl',
      ],
      [
        'CC0 with PDM URL',
        { license: 'CC0 1.0', licenseUrl: pdmUrl },
        'image.licenseUrl',
      ],
    ];

    for (const [label, overrides, expectedPath] of cases) {
      await expectImageValidationError(
        (image) => {
          Object.assign(image, overrides);
        },
        expectedPath,
        label,
      );
    }
  });

  it('rejects image dimensions above 1600 pixels', async () => {
    await expectImageValidationError((image) => {
      image.width = 1601;
    }, 'image.width');
  });

  it('rejects an image byteLength outside the allowed range', async () => {
    await expectImageValidationError((image) => {
      image.byteLength = 0;
    }, 'image.byteLength');
  });

  it('rejects an invalid image file revision id', async () => {
    await expectImageValidationError((image) => {
      image.fileRevisionId = '0';
    }, 'image.fileRevisionId');
  });

  it('rejects an invalid image retrieval date', async () => {
    await expectImageValidationError((image) => {
      image.retrievedAt = '2026-02-30';
    }, 'image.retrievedAt');
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

  it('accepts optional source translators', async () => {
    const payload = cloneArticlePayload();
    const source = payload.source as Record<string, unknown>;
    source.translators = ['Guillaume Cottin'];
    stubFetch({ [`/data/${articlePath}`]: { body: payload } });
    const { loadArticle } = await loadContentModule();

    await expect(loadArticle(articlePath)).resolves.toMatchObject({
      source: { translators: ['Guillaume Cottin'] },
    });
  });

  it('rejects an empty source translators array', async () => {
    const payload = cloneArticlePayload();
    const source = payload.source as Record<string, unknown>;
    source.translators = [];

    await expectArticleValidationError(payload, 'source.translators');
  });

  it('rejects a source translators value that is not an array', async () => {
    const payload = cloneArticlePayload();
    const source = payload.source as Record<string, unknown>;
    source.translators = 'Guillaume Cottin';

    await expectArticleValidationError(payload, 'source.translators');
  });

  it('rejects an empty translator name', async () => {
    const payload = cloneArticlePayload();
    const source = payload.source as Record<string, unknown>;
    source.translators = ['Guillaume Cottin', ' '];

    await expectArticleValidationError(payload, 'source.translators');
  });

  it('rejects a non-string translator name', async () => {
    const payload = cloneArticlePayload();
    const source = payload.source as Record<string, unknown>;
    source.translators = [42];

    await expectArticleValidationError(payload, 'source.translators');
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

  it('resolves image URLs from the default content base', async () => {
    const { resolveImageUrl } = await loadContentModule();

    expect(resolveImageUrl(validImage.path)).toBe(
      `/data/${validImage.path}`,
    );
  });

  it('resolves image URLs from VITE_CONTENT_BASE_URL', async () => {
    vi.stubEnv(
      'VITE_CONTENT_BASE_URL',
      'https://content.example/base',
    );
    const { resolveImageUrl } = await loadContentModule();

    expect(resolveImageUrl(validImage.path)).toBe(
      `https://content.example/base/${validImage.path}`,
    );
  });

  it('rejects unsafe image paths when resolving URLs', async () => {
    const { resolveImageUrl, ContentValidationError } =
      await loadContentModule();

    expect(() => resolveImageUrl('../images/photo-0123456789ab.jpg')).toThrow(
      ContentValidationError,
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
