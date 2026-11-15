import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ReadPage from './ReadPage';
import { resolveArticleById } from '../lib/content';
import { lookupFrToZh } from '../lib/dictionary';
import { i18n } from '../i18n';
import { readStudyData } from '../features/data/backup';
import {
  getReadingProgress,
  saveReadingProgress,
} from '../features/data/studyData';
import { listVocabulary } from '../features/vocabulary/vocabulary';
import type { Article, ArticleImage } from '../types/content';

vi.mock('../lib/content', () => ({
  resolveArticleById: vi.fn(),
  resolveImageUrl: vi.fn((path: string) => `/data/${path}`),
}));

vi.mock('../lib/dictionary', () => ({
  lookupFrToZh: vi.fn(),
}));

const article: Article = {
  id: '2026-11-09-tour-eiffel',
  title: 'La tour Eiffel',
  level: 'B1',
  theme: 'culture',
  date: '2026-11-09',
  summary: 'Un article de test sur la tour Eiffel.',
  paragraphs: [
    {
      sentences: ['La tour Eiffel est situé à Paris.'],
    },
  ],
  glossary: [{ term: 'situé' }, { term: 'Paris' }],
  questions: [],
  translations: {
    zh: {
      title: '埃菲尔铁塔',
      summary: '一篇关于埃菲尔铁塔的测试文章。',
      paragraphs: [
        {
          sentences: ['埃菲尔铁塔位于巴黎。'],
        },
      ],
      glossary: { situé: '位于，坐落在', Paris: '巴黎市' },
      questions: {},
    },
  },
  source: {
    site: 'Wikipédia en français',
    title: 'Tour Eiffel',
    authors: ['Contributeurs de Wikipédia'],
    url: 'https://fr.wikipedia.org/wiki/Tour_Eiffel',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    retrievedAt: '2026-11-09',
    revisionId: '241075004',
  },
  adaptation: {
    model: 'rédaction interne',
    date: '2026-11-09',
    changes: 'Version simplifiée au niveau B1.',
    reviewer: 'révision éditoriale',
  },
  license: {
    name: 'CC BY-SA 4.0',
    url: 'https://creativecommons.org/licenses/by-sa/4.0/',
  },
};

const articleImage: ArticleImage = {
  path: 'images/2026-11-09-tour-eiffel-0123456789ab.jpg',
  alt: 'La tour Eiffel vue depuis le Champ-de-Mars',
  author: 'Jane Doe',
  sourceUrl:
    'https://commons.wikimedia.org/wiki/File:Tour_Eiffel_Champ_de_Mars.jpg?oldid=123456789',
  license: 'CC BY-SA 3.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
  changes: 'Image redimensionnée à 1200 px de large.',
  width: 1200,
  height: 800,
  byteLength: 345_678,
  sha256: '0123456789abcdef'.repeat(4),
  fileRevisionId: '123456789',
  retrievedAt: '2026-11-14',
};

function renderRead(path = '/read/2026-11-09-tour-eiffel') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/read/:id" element={<ReadPage />} />
        <Route path="/read" element={<ReadPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockSelection(
  text: string,
  getNode: () => Element | null = () =>
    document.querySelector('.sentence-fr'),
) {
  let selectedText = text;
  const selection = {
    toString: () => selectedText,
    get isCollapsed() {
      return selectedText.length === 0;
    },
    get anchorNode() {
      return selectedText ? getNode() : null;
    },
    get focusNode() {
      return selectedText ? getNode() : null;
    },
    get rangeCount() {
      return selectedText ? 1 : 0;
    },
    getRangeAt: () => ({
      startContainer: getNode(),
      endContainer: getNode(),
    }),
    removeAllRanges: () => {
      selectedText = '';
    },
  };

  vi.stubGlobal('getSelection', vi.fn(() => selection));
  return selection;
}

describe('ReadPage', () => {
  let now = 0;
  const mountDate = new Date('2026-11-10T00:00:00Z');

  beforeEach(() => {
    now = 0;
    vi.mocked(resolveArticleById).mockReset();
    vi.mocked(resolveArticleById).mockResolvedValue(article);
    vi.mocked(lookupFrToZh).mockReset();

    vi.spyOn(performance, 'now').mockImplementation(() => now);

    class MockedDate extends Date {
      constructor(...args: unknown[]) {
        const dateArgs = args.length === 0 ? [mountDate] : args;
        super(...(dateArgs as [string | number | Date]));
      }
      static override now(): number {
        return mountDate.getTime();
      }
    }
    vi.stubGlobal('Date', MockedDate);

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true,
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(window, 'scrollY');
    Reflect.deleteProperty(window, 'innerHeight');
    Reflect.deleteProperty(document.documentElement, 'scrollHeight');
  });

  function advanceTime(ms: number) {
    act(() => {
      now += ms;
    });
  }

  it('renders the French title, summary and sentences', async () => {
    renderRead();

    const title = await screen.findByRole('heading', { name: article.title });
    expect(title).toHaveAttribute('lang', 'fr');
    expect(screen.getByText(article.summary)).toHaveAttribute('lang', 'fr');
    expect(
      screen.queryByText(article.translations.zh.title),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(article.translations.zh.summary),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('level-badge')).toHaveTextContent('B1');
    expect(
      screen.getByText((content) => content.includes('La tour Eiffel est')),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'situé : 位于，坐落在' }),
    ).toBeInTheDocument();
  });

  it('renders the attributed article image before the body', async () => {
    vi.mocked(resolveArticleById).mockResolvedValue({
      ...article,
      image: articleImage,
    });

    renderRead();
    await screen.findByRole('heading', { name: article.title });

    const figure = screen.getByTestId('article-image');
    expect(figure.nextElementSibling).toBe(screen.getByTestId('article-body'));
    expect(screen.getByRole('img', { name: articleImage.alt })).toHaveAttribute(
      'src',
      `/data/${articleImage.path}`,
    );
    expect(
      screen.getByRole('link', { name: 'Wikimedia Commons' }),
    ).toHaveAttribute('href', articleImage.sourceUrl);
    expect(
      screen.getByRole('link', { name: articleImage.license }),
    ).toHaveAttribute('href', articleImage.licenseUrl);
  });

  it('renders no image figure for articles without an image', async () => {
    const { container } = renderRead();
    await screen.findByRole('heading', { name: article.title });

    expect(container.querySelector('figure')).toBeNull();
  });

  it('shows the Global Voices attribution before the article when requested', async () => {
    vi.mocked(resolveArticleById).mockResolvedValue({
      ...article,
      source: {
        ...article.source,
        site: 'Global Voices en Français',
        authors: ['Mamisoa Raveloaritiana'],
        url: 'https://fr.globalvoices.org/2026/11/09/304239/',
        license: 'CC BY 3.0',
        licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
        retrievedAt: '2026-11-10',
        publishedAt: '2026-11-09',
        attributionPosition: 'top',
      },
    });

    const { container } = renderRead();

    await screen.findByRole('heading', { name: article.title });
    const top = container.querySelector('.global-voices-attribution');
    expect(top).not.toBeNull();
    expect(top).toHaveTextContent('Mamisoa Raveloaritiana');
    expect(top).toHaveTextContent('2026-11-09');
    expect(
      top!.compareDocumentPosition(screen.getByTestId('article-body')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('shows the French loading text until the article resolves', async () => {
    let resolveArticle: (value: Article) => void = () => {};
    vi.mocked(resolveArticleById).mockImplementation(
      () =>
        new Promise<Article>((resolve) => {
          resolveArticle = resolve;
        }),
    );

    renderRead();

    expect(screen.getByRole('status')).toHaveTextContent('Chargement…');
    expect(
      screen.queryByRole('link', { name: "Commencer l'exercice" }),
    ).not.toBeInTheDocument();

    await act(async () => {
      resolveArticle(article);
    });

    expect(
      await screen.findByRole('heading', { name: article.title }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Chargement…')).not.toBeInTheDocument();
  });

  it('hides Chinese title, summary and sentences until the toggle is clicked', async () => {
    renderRead();

    await screen.findByRole('heading', { name: article.title });

    expect(
      screen.queryByText(article.translations.zh.title),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(article.translations.zh.summary),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(article.translations.zh.paragraphs[0].sentences[0]),
    ).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: 'Traduction chinoise' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(article.translations.zh.title)).toBeInTheDocument();
    expect(
      screen.getByText(article.translations.zh.summary),
    ).toBeInTheDocument();
    expect(
      screen.getByText(article.translations.zh.paragraphs[0].sentences[0]),
    ).toBeInTheDocument();

    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(
      screen.queryByText(article.translations.zh.title),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(article.translations.zh.summary),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(article.translations.zh.paragraphs[0].sentences[0]),
    ).not.toBeInTheDocument();
  });

  it('switches UI labels to Chinese while keeping the French article and toggle state', async () => {
    renderRead();

    await screen.findByRole('heading', { name: article.title });
    await userEvent.click(
      screen.getByRole('button', { name: 'Traduction chinoise' }),
    );

    expect(screen.getByText(article.translations.zh.title)).toBeInTheDocument();

    await act(async () => {
      await i18n.changeLanguage('zh');
    });

    expect(
      screen.getByRole('link', { name: '开始练习' }),
    ).toHaveAttribute('href', '/practice/2026-11-09-tour-eiffel');
    expect(
      screen.getByRole('button', { name: '中文对照' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('heading', { name: article.title }),
    ).toHaveAttribute('lang', 'fr');
    expect(screen.getByText(article.translations.zh.title)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'situé：位于，坐落在' }),
    ).toBeInTheDocument();
  });

  it('shows a glossary term explanation when clicked', async () => {
    renderRead();

    await screen.findByRole('heading', { name: article.title });
    await userEvent.click(screen.getByRole('button', { name: /situé/ }));

    const panel = screen.getByRole('dialog', {
      name: 'Vocabulaire et traduction',
    });
    expect(panel).toHaveTextContent('situé');
    expect(panel).toHaveTextContent('位于，坐落在');
    expect(
      screen.getByRole('button', { name: 'Traduire' }),
    ).toBeInTheDocument();
  });

  it('localizes the explanation panel with the UI language', async () => {
    renderRead();

    await screen.findByRole('heading', { name: article.title });
    await userEvent.click(screen.getByRole('button', { name: /situé/ }));

    expect(
      screen.getByRole('dialog', { name: 'Vocabulaire et traduction' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fermer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Traduire' })).toBeInTheDocument();

    await act(async () => {
      await i18n.changeLanguage('zh');
    });

    const panel = screen.getByRole('dialog', { name: '词汇与翻译' });
    expect(panel).toHaveTextContent('位于，坐落在');
    expect(screen.getByRole('button', { name: '关闭' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '查翻译' })).toBeInTheDocument();
  });

  it('focuses the close button and closes on Escape', async () => {
    renderRead();

    await screen.findByRole('heading', { name: article.title });
    await userEvent.click(screen.getByRole('button', { name: /situé/ }));

    expect(screen.getByRole('button', { name: 'Fermer' })).toHaveFocus();

    await userEvent.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('renders the license block', async () => {
    renderRead();

    await screen.findByRole('heading', { name: article.title });

    expect(screen.getByText(/Texte adapté de/)).toBeInTheDocument();
    expect(screen.getByText(/Aucune approbation par l'auteur original\./)).toBeInTheDocument();
  });

  it('links to the practice page', async () => {
    renderRead();

    await screen.findByRole('heading', { name: article.title });

    const practiceLink = screen.getByRole('link', {
      name: "Commencer l'exercice",
    });
    expect(practiceLink).toHaveAttribute('href', '/practice/2026-11-09-tour-eiffel');
  });

  it('shows translation button and looks up selected text', async () => {
    vi.mocked(lookupFrToZh).mockResolvedValue('巴黎');
    mockSelection('Paris');

    renderRead();

    await screen.findByRole('heading', { name: article.title });

    const articleBody = screen.getByTestId('article-body');
    await userEvent.click(articleBody);

    const translateButton = await screen.findByRole('button', {
      name: 'Traduire la sélection',
    });
    await userEvent.click(translateButton);

    await waitFor(() => {
      expect(lookupFrToZh).toHaveBeenCalledWith('Paris');
    });

    expect(screen.getByText('巴黎')).toBeInTheDocument();
    expect(screen.getByText('Texte sélectionné')).toBeInTheDocument();
  });

  it('ignores a stale translation result after switching terms', async () => {
    let resolveFirst: (value: string) => void = () => {};
    const first = new Promise<string>((resolve) => {
      resolveFirst = resolve;
    });
    vi.mocked(lookupFrToZh).mockImplementationOnce(() => first);

    renderRead();

    await screen.findByRole('heading', { name: article.title });

    await userEvent.click(screen.getByRole('button', { name: /situé/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Traduire' }));
    expect(screen.getByText('Recherche en cours…')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Paris/ }));
    expect(screen.getByRole('dialog')).toHaveTextContent('巴黎市');

    await act(async () => {
      resolveFirst('旧翻译');
      await first;
    });

    expect(screen.queryByText('旧翻译')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveTextContent('巴黎市');
  });

  it('adds a selected word to the notebook only after the explicit action', async () => {
    mockSelection('Paris');
    renderRead();
    await screen.findByRole('heading', { name: article.title });

    await userEvent.click(screen.getByTestId('article-body'));
    expect(listVocabulary()).toHaveLength(0);

    const add = await screen.findByRole('button', {
      name: 'Ajouter au carnet',
    });
    await userEvent.click(add);

    const [entry] = listVocabulary();
    expect(entry).toMatchObject({
      term: 'Paris',
      context: 'La tour Eiffel est situé à Paris.',
      articleId: article.id,
      articleTitle: article.title,
    });
    expect(screen.getByRole('status')).toHaveTextContent('Ajouté au carnet.');
    expect(
      screen.getByRole('link', { name: 'Voir le carnet' }),
    ).toHaveAttribute('href', '/mots');
  });

  it('stores the original source sentence when adding a glossary term', async () => {
    renderRead();
    await screen.findByRole('heading', { name: article.title });

    await userEvent.click(
      screen.getByRole('button', { name: /situé/ }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Ajouter ce mot au carnet' }),
    );

    expect(listVocabulary()[0]).toMatchObject({
      term: 'situé',
      translation: '位于，坐落在',
      context: 'La tour Eiffel est situé à Paris.',
      articleId: article.id,
      articleTitle: article.title,
    });
  });

  it('saves the translation returned by the lookup panel when asked', async () => {
    vi.mocked(lookupFrToZh).mockResolvedValue('巴黎');
    mockSelection('Paris');
    renderRead();
    await screen.findByRole('heading', { name: article.title });

    await userEvent.click(screen.getByTestId('article-body'));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Traduire la sélection' }),
    );
    expect(await screen.findByText('巴黎')).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Ajouter avec cette traduction' }),
    );

    expect(listVocabulary()[0]).toMatchObject({
      term: 'Paris',
      translation: '巴黎',
      articleTitle: article.title,
    });
  });

  it('shows a calm error and removes loading text when translation fails', async () => {
    vi.mocked(lookupFrToZh).mockResolvedValue(null);
    mockSelection('Paris');

    renderRead();

    await screen.findByRole('heading', { name: article.title });

    const articleBody = screen.getByTestId('article-body');
    await userEvent.click(articleBody);

    const translateButton = await screen.findByRole('button', {
      name: 'Traduire la sélection',
    });
    await userEvent.click(translateButton);

    await waitFor(() => {
      expect(
        screen.getByText('La traduction a échoué. Réessayez plus tard.'),
      ).toBeInTheDocument();
    });

    expect(screen.queryByText('Recherche en cours…')).not.toBeInTheDocument();
  });

  it('shows a localized error state with the raw detail collapsed', async () => {
    vi.mocked(resolveArticleById).mockRejectedValue(new Error('network down'));

    renderRead();

    expect(
      await screen.findByRole('heading', {
        name: "Impossible de charger l'article.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Vérifiez votre connexion, puis réessayez.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Réessayer' }),
    ).toBeInTheDocument();

    const details = screen.getByText('Détail technique').closest('details');
    expect(details).not.toHaveAttribute('open');
    expect(details).toHaveTextContent('network down');
  });

  it('shows a localized missing article id error', async () => {
    renderRead('/read');

    expect(
      await screen.findByRole('heading', {
        name: "Impossible de charger l'article.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Identifiant d'article manquant"),
    ).toBeInTheDocument();
    expect(resolveArticleById).not.toHaveBeenCalled();
  });

  it('saves a reading session on unmount when elapsed >= 1000 using the real hook', async () => {
    const mountTime = mountDate.toISOString();

    const { unmount } = renderRead();
    await screen.findByRole('heading', { name: article.title });

    advanceTime(2_000);
    mountDate.setSeconds(mountDate.getSeconds() + 2);

    unmount();

    const sessions = readStudyData().readingSessions;
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      articleId: article.id,
      startedAt: mountTime,
      durationMs: expect.any(Number),
    });
    expect(sessions[0].durationMs).toBeGreaterThanOrEqual(1900);
    expect(sessions[0].durationMs).toBeLessThanOrEqual(2100);
    expect(sessions[0].id).toEqual(expect.any(String));
    expect(new Date(sessions[0].startedAt).getTime()).toBeLessThan(Date.now());
  });

  it('checkpoints reading time on pagehide without duplicating the session', async () => {
    const { unmount } = renderRead();
    await screen.findByRole('heading', { name: article.title });

    advanceTime(2_000);
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });

    const checkpoint = readStudyData().readingSessions;
    expect(checkpoint).toHaveLength(1);
    const sessionId = checkpoint[0].id;
    expect(checkpoint[0].durationMs).toBeGreaterThanOrEqual(1_900);

    advanceTime(2_000);
    unmount();

    const final = readStudyData().readingSessions;
    expect(final).toHaveLength(1);
    expect(final[0].id).toBe(sessionId);
    expect(final[0].durationMs).toBeGreaterThanOrEqual(3_900);
  });

  it('checkpoints reading time when the tab is hidden', async () => {
    renderRead();
    await screen.findByRole('heading', { name: article.title });

    advanceTime(1_500);
    act(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        writable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    const sessions = readStudyData().readingSessions;
    expect(sessions).toHaveLength(1);
    expect(sessions[0].durationMs).toBeGreaterThanOrEqual(1_400);
  });

  it('restores a saved reading position and records completion at the end', async () => {
    saveReadingProgress({
      articleId: article.id,
      position: 0.5,
      completed: false,
      updatedAt: '2026-11-09T10:00:00.000Z',
    });
    Object.defineProperty(window, 'scrollY', {
      value: 0,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'innerHeight', {
      value: 1_000,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      value: 2_000,
      writable: true,
      configurable: true,
    });
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    renderRead();
    await screen.findByRole('heading', { name: article.title });

    await waitFor(() => {
      expect(scrollTo).toHaveBeenCalledWith(0, 500);
    });

    act(() => {
      Object.defineProperty(window, 'scrollY', {
        value: 1_000,
        writable: true,
        configurable: true,
      });
      window.dispatchEvent(new Event('scroll'));
    });

    await waitFor(() => {
      expect(getReadingProgress(article.id)).toMatchObject({
        position: 1,
        completed: true,
      });
    });

    Reflect.deleteProperty(window, 'scrollY');
    Reflect.deleteProperty(window, 'innerHeight');
    Reflect.deleteProperty(document.documentElement, 'scrollHeight');
  });

  it('does not save a reading session when elapsed < 1000', async () => {
    const { unmount } = renderRead();
    await screen.findByRole('heading', { name: article.title });

    advanceTime(500);
    unmount();

    expect(readStudyData().readingSessions).toHaveLength(0);
  });

  it('does not save a session while the article is still loading', async () => {
    vi.mocked(resolveArticleById).mockImplementation(
      () => new Promise(() => {}), // never resolves
    );

    const { unmount } = renderRead();
    advanceTime(2_000);
    unmount();

    expect(readStudyData().readingSessions).toHaveLength(0);
  });
});
