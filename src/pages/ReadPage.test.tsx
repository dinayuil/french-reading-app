import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ReadPage from './ReadPage';
import { resolveArticleById } from '../lib/content';
import { lookupFrToZh } from '../lib/dictionary';
import { i18n } from '../i18n';
import * as storage from '../lib/storage';
import type { Article } from '../types/content';

vi.mock('../lib/content', () => ({
  resolveArticleById: vi.fn(),
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

describe('ReadPage', () => {
  let appendSessionSpy: ReturnType<typeof vi.spyOn>;
  let now = 0;
  const mountDate = new Date('2026-11-10T00:00:00Z');

  beforeEach(() => {
    now = 0;
    vi.mocked(resolveArticleById).mockReset();
    vi.mocked(resolveArticleById).mockResolvedValue(article);
    vi.mocked(lookupFrToZh).mockReset();
    appendSessionSpy = vi.spyOn(storage, 'appendSession').mockImplementation(() => {});

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

    vi.stubGlobal(
      'getSelection',
      vi.fn().mockReturnValue({
        toString: () => 'Paris',
        rangeCount: 1,
        getRangeAt: () => ({}),
        removeAllRanges: () => {},
      }),
    );

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

  it('shows a calm error and removes loading text when translation fails', async () => {
    vi.mocked(lookupFrToZh).mockResolvedValue(null);

    vi.stubGlobal(
      'getSelection',
      vi.fn().mockReturnValue({
        toString: () => 'Paris',
        rangeCount: 1,
        getRangeAt: () => ({}),
        removeAllRanges: () => {},
      }),
    );

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

    expect(appendSessionSpy).toHaveBeenCalledWith(
      'reading-sessions',
      expect.objectContaining({
        articleId: article.id,
        startedAt: mountTime,
        durationMs: expect.any(Number),
      }),
    );
    const saved = appendSessionSpy.mock.calls[0][1] as {
      startedAt: string;
      durationMs: number;
    };
    expect(saved.durationMs).toBeGreaterThanOrEqual(1900);
    expect(saved.durationMs).toBeLessThanOrEqual(2100);
    expect(saved.startedAt).toBe(mountTime);
    expect(new Date(saved.startedAt).getTime()).toBeLessThan(Date.now());
  });

  it('does not save a reading session when elapsed < 1000', async () => {
    const { unmount } = renderRead();
    await screen.findByRole('heading', { name: article.title });

    advanceTime(500);
    unmount();

    expect(appendSessionSpy).not.toHaveBeenCalled();
  });

  it('does not save a session while the article is still loading', async () => {
    vi.mocked(resolveArticleById).mockImplementation(
      () => new Promise(() => {}), // never resolves
    );

    const { unmount } = renderRead();
    advanceTime(2_000);
    unmount();

    expect(appendSessionSpy).not.toHaveBeenCalled();
  });
});
