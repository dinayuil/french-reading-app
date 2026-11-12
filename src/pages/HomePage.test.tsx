import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import HomePage from './HomePage';
import { i18n } from '../i18n';
import { loadDay, loadManifest } from '../lib/content';
import type { ArticleIndexEntry, CefrLevel } from '../types/content';

vi.mock('../lib/content', () => ({
  loadManifest: vi.fn(),
  loadDay: vi.fn(),
}));

const TODAY = '2026-11-12';
const DEFAULT_WIDTH = window.innerWidth;
const MANIFEST_DAYS = [
  '2026-11-20',
  '2026-11-12',
  '2026-11-11',
  '2026-11-10',
  '2026-11-09',
  '2026-11-08',
  '2026-11-07',
  '2026-11-06',
  '2026-11-05',
  '2026-10-13',
];

type DayResult = { date: string; articles: ArticleIndexEntry[] };

function article(
  id: string,
  title: string,
  date: string,
  level: CefrLevel = 'B1',
  theme = 'culture',
): ArticleIndexEntry {
  return {
    id,
    title,
    level,
    theme,
    date,
    summary: 'Un résumé de test.',
    path: `articles/${id}.json`,
  };
}

const tourEiffel = article(
  '2026-11-12-tour-eiffel',
  'La tour Eiffel',
  TODAY,
  'B1',
  'culture',
);
const cafe = article(
  '2026-11-11-cafe',
  'Le café en France',
  '2026-11-11',
  'A2',
  'gastronomie',
);
const marche = article(
  '2026-11-06-marche',
  'Le marché du samedi',
  '2026-11-06',
  'B1',
  'société',
);

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];

  disconnected = false;
  readonly root = null;
  readonly rootMargin = '0px';
  readonly thresholds: readonly number[] = [];
  private readonly callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }

  observe(): void {}

  unobserve(): void {
    this.disconnected = true;
  }

  disconnect(): void {
    this.disconnected = true;
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  fire(): void {
    this.callback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

class RealisticIntersectionObserver {
  static instances: RealisticIntersectionObserver[] = [];
  static targetsIntersecting = false;

  disconnected = false;
  readonly root = null;
  readonly rootMargin = '0px';
  readonly thresholds: readonly number[] = [];
  private lastDelivered: boolean | null = null;
  private readonly callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    RealisticIntersectionObserver.instances.push(this);
  }

  observe(): void {
    if (RealisticIntersectionObserver.targetsIntersecting) {
      queueMicrotask(() => {
        if (!this.disconnected) this.deliver(true);
      });
    }
  }

  unobserve(): void {
    this.disconnected = true;
  }

  disconnect(): void {
    this.disconnected = true;
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  deliver(isIntersecting: boolean): void {
    // A real observer does not re-deliver an unchanged intersection state.
    // Only a new observe() (a re-created observer) reports the current state.
    if (this.lastDelivered === isIntersecting) return;
    this.lastDelivered = isIntersecting;
    this.callback(
      [{ isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
}

function enterRealisticViewport() {
  RealisticIntersectionObserver.targetsIntersecting = true;
  const active = [...RealisticIntersectionObserver.instances]
    .reverse()
    .find((instance) => !instance.disconnected);
  if (!active) throw new Error('No active realistic observer');
  active.deliver(true);
}

async function triggerViewport() {
  const observer = await waitFor(() => {
    const active = [...MockIntersectionObserver.instances]
      .reverse()
      .find((instance) => !instance.disconnected);
    if (!active) throw new Error('No active IntersectionObserver');
    return active;
  });

  await act(async () => {
    observer.fire();
  });
}

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<HomePage today={TODAY} />} />
        <Route
          path="/read/:id"
          element={<div data-testid="read-page">Read page</div>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('HomePage', () => {
  let dayArticles: Record<string, ArticleIndexEntry[]>;

  beforeEach(() => {
    MockIntersectionObserver.instances = [];
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    localStorage.setItem(
      'frp:settings',
      JSON.stringify({ onboardingSeen: true }),
    );

    dayArticles = {
      '2026-11-12': [tourEiffel],
      '2026-11-11': [cafe],
      '2026-11-06': [marche],
    };

    vi.mocked(loadManifest).mockReset();
    vi.mocked(loadDay).mockReset();
    vi.mocked(loadManifest).mockResolvedValue({ days: [...MANIFEST_DAYS] });
    vi.mocked(loadDay).mockImplementation(async (date: string) => ({
      date,
      articles: dayArticles[date] ?? [],
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    setViewportWidth(DEFAULT_WIDTH);
  });

  it('renders the French hero and only requests the first day in range', async () => {
    const { container } = renderHome();

    expect(await screen.findByText('La tour Eiffel')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Lecture en français',
    );
    expect(
      screen.queryByText(
        'Des textes en français, du niveau A2 au B2, à lire et à pratiquer.',
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Le français, jour après jour'),
    ).toBeInTheDocument();

    const hero = container.querySelector<HTMLElement>('.home-hero');
    expect(hero).not.toBeNull();
    if (!hero) throw new Error('Expected the home hero');
    expect(hero).not.toHaveTextContent('A2');
    expect(hero).not.toHaveTextContent('B1');
    expect(hero).not.toHaveTextContent('B2');
    expect(screen.getByRole('button', { name: 'Tous' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: '3 jours' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      screen.getByRole('button', { name: 'Plus récents' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('1 article affiché')).toBeInTheDocument();
    expect(screen.getByTestId('level-badge')).toHaveTextContent('B1');
    expect(screen.getByText('Culture')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Aujourd'hui/ }),
    ).toBeInTheDocument();

    expect(loadManifest).toHaveBeenCalledTimes(1);
    expect(loadDay).toHaveBeenCalledTimes(1);
    expect(loadDay).toHaveBeenCalledWith('2026-11-12');
    expect(loadDay).not.toHaveBeenCalledWith('2026-11-20');
  });

  it('starts with one card on a phone and grows row by row near the viewport', async () => {
    setViewportWidth(375);
    dayArticles['2026-11-12'] = [
      article('2026-11-12-batch-1', 'Titre 1', TODAY, 'B1'),
      article('2026-11-12-batch-2', 'Titre 2', TODAY, 'B1'),
    ];

    renderHome();

    expect(await screen.findByText('Titre 1')).toBeInTheDocument();
    expect(screen.getAllByTestId('level-badge')).toHaveLength(1);
    expect(screen.queryByText('Titre 2')).not.toBeInTheDocument();
    expect(screen.getByText('1 article affiché')).toBeInTheDocument();
    expect(loadDay).toHaveBeenCalledTimes(1);

    await triggerViewport();

    expect(await screen.findByText('Titre 2')).toBeInTheDocument();
    expect(screen.getAllByTestId('level-badge')).toHaveLength(2);
    expect(screen.getByText('2 articles affichés')).toBeInTheDocument();
    expect(loadDay).toHaveBeenCalledTimes(1);

    await triggerViewport();

    expect(await screen.findByText('Le café en France')).toBeInTheDocument();
    expect(loadDay).toHaveBeenLastCalledWith('2026-11-11');
  });

  it('starts with one row on desktop and reveals more only near the viewport', async () => {
    setViewportWidth(1024);
    dayArticles['2026-11-12'] = Array.from({ length: 5 }, (_, index) =>
      article(
        `2026-11-12-row-${index + 1}`,
        `Ligne ${index + 1}`,
        TODAY,
        'B1',
      ),
    );

    renderHome();

    expect(await screen.findByText('Ligne 1')).toBeInTheDocument();
    expect(screen.getAllByTestId('level-badge')).toHaveLength(3);
    expect(screen.queryByText('Ligne 4')).not.toBeInTheDocument();
    expect(loadDay).toHaveBeenCalledTimes(1);

    await triggerViewport();

    expect(await screen.findByText('Ligne 5')).toBeInTheDocument();
    expect(screen.getAllByTestId('level-badge')).toHaveLength(5);
    expect(loadDay).toHaveBeenCalledTimes(1);
  });

  it('re-observes after an instantly loaded empty day to reach a later matching day', async () => {
    setViewportWidth(610);
    RealisticIntersectionObserver.instances = [];
    RealisticIntersectionObserver.targetsIntersecting = false;
    vi.stubGlobal('IntersectionObserver', RealisticIntersectionObserver);
    dayArticles = {
      '2026-11-12': [
        article('b2-today', "B2 aujourd'hui", TODAY, 'B2'),
      ],
      '2026-11-11': [],
      '2026-11-10': [
        article('b2-old', 'B2 ancien', '2026-11-10', 'B2'),
      ],
    };

    renderHome();

    expect(await screen.findByText("B2 aujourd'hui")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        RealisticIntersectionObserver.instances.some(
          (instance) => !instance.disconnected,
        ),
      ).toBe(true),
    );

    await act(async () => {
      enterRealisticViewport();
    });

    expect(await screen.findByText('B2 ancien')).toBeInTheDocument();
    expect(loadDay).toHaveBeenCalledWith('2026-11-11');
    expect(loadDay).toHaveBeenCalledWith('2026-11-10');
    expect(screen.getByText('2 articles affichés')).toBeInTheDocument();
  });

  it('uses the continue button when the viewport observer is unavailable', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);

    renderHome();
    await screen.findByText('La tour Eiffel');

    await userEvent.click(
      screen.getByRole('button', { name: "Afficher plus d'articles" }),
    );

    expect(await screen.findByText('Le café en France')).toBeInTheDocument();
    expect(loadDay).toHaveBeenLastCalledWith('2026-11-11');
  });

  it('automatically skips days without the selected level and shows the matching day', async () => {
    dayArticles = {
      '2026-11-12': [article('a2-newest', 'Article A2 récent', TODAY, 'A2')],
      '2026-11-11': [
        article('a2-middle', 'Article A2 moyen', '2026-11-11', 'A2'),
      ],
      '2026-11-10': [
        article('b2-oldest', 'Le niveau B2', '2026-11-10', 'B2'),
      ],
    };

    renderHome();
    await screen.findByText('Article A2 récent');

    await userEvent.click(screen.getByRole('button', { name: 'B2' }));

    expect(await screen.findByText('Le niveau B2')).toBeInTheDocument();
    expect(screen.getByText('1 article affiché')).toBeInTheDocument();
    expect(loadDay).toHaveBeenCalledWith('2026-11-11');
    expect(loadDay).toHaveBeenCalledWith('2026-11-10');
    expect(
      screen.queryByText('Aucun article pour cette période et ce niveau.'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Tous les articles de cette période sont affichés.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: "Afficher plus d'articles" }),
    ).not.toBeInTheDocument();
  });

  it('automatically shows the empty state after checking every day in range', async () => {
    dayArticles = {
      '2026-11-12': [article('a2-a', 'Article A2 A', TODAY, 'A2')],
      '2026-11-11': [
        article('a2-b', 'Article A2 B', '2026-11-11', 'A2'),
      ],
      '2026-11-10': [
        article('a2-c', 'Article A2 C', '2026-11-10', 'A2'),
      ],
    };

    renderHome();
    await screen.findByText('Article A2 A');

    await userEvent.click(screen.getByRole('button', { name: 'B2' }));

    expect(
      await screen.findByText(
        'Aucun article pour cette période et ce niveau.',
      ),
    ).toBeInTheDocument();
    expect(loadDay).toHaveBeenCalledWith('2026-11-11');
    expect(loadDay).toHaveBeenCalledWith('2026-11-10');
    expect(
      screen.queryByRole('button', { name: "Afficher plus d'articles" }),
    ).not.toBeInTheDocument();
  });

  it('resets to the oldest day when the range and sort change', async () => {
    renderHome();
    await screen.findByText('La tour Eiffel');

    await userEvent.click(screen.getByRole('button', { name: '7 jours' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Plus anciens' }),
    );

    expect(await screen.findByText('Le marché du samedi')).toBeInTheDocument();
    expect(loadDay).toHaveBeenLastCalledWith('2026-11-06');
    expect(loadDay).not.toHaveBeenCalledWith('2026-11-05');
    expect(loadDay).not.toHaveBeenCalledWith('2026-10-13');
    expect(screen.getByRole('button', { name: '7 jours' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      screen.getByRole('button', { name: 'Plus anciens' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows a localized error state for a manifest failure and retries', async () => {
    vi.mocked(loadManifest)
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ days: [...MANIFEST_DAYS] });

    renderHome();

    expect(
      await screen.findByRole('heading', {
        name: 'Impossible de charger la liste',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Vérifiez votre connexion, puis réessayez.'),
    ).toBeInTheDocument();
    expect(loadDay).not.toHaveBeenCalled();

    const detail = screen.getByText('network down');
    const details = detail.closest('details');
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute('open');

    await userEvent.click(screen.getByText('Détail technique'));
    expect(details).toHaveAttribute('open');

    await userEvent.click(
      screen.getByRole('button', { name: 'Réessayer' }),
    );

    expect(await screen.findByText('La tour Eiffel')).toBeInTheDocument();
    expect(loadManifest).toHaveBeenCalledTimes(2);
  });

  it('keeps displayed cards when a later day fails and retries only that day', async () => {
    let nextDayAttempts = 0;
    vi.mocked(loadDay).mockImplementation(async (date: string) => {
      if (date === '2026-11-12') {
        return { date, articles: [tourEiffel] };
      }
      if (date === '2026-11-11') {
        nextDayAttempts += 1;
        if (nextDayAttempts === 1) throw new Error('network down');
        return { date, articles: [cafe] };
      }
      return { date, articles: [] };
    });

    renderHome();
    await screen.findByText('La tour Eiffel');

    await triggerViewport();

    expect(
      await screen.findByRole('heading', {
        name: 'Impossible de charger cette journée',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Les articles déjà affichés restent disponibles. Réessayez pour charger la suite.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('La tour Eiffel')).toBeInTheDocument();
    expect(nextDayAttempts).toBe(1);
    expect(
      screen.queryByRole('button', { name: "Afficher plus d'articles" }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Réessayer' }),
    );

    expect(await screen.findByText('Le café en France')).toBeInTheDocument();
    expect(screen.getByText('La tour Eiffel')).toBeInTheDocument();
    expect(nextDayAttempts).toBe(2);
  });

  it('ignores an old day response after a quick sort switch', async () => {
    let resolveNewest!: (value: DayResult) => void;
    let resolveOldest!: (value: DayResult) => void;
    const newest = new Promise<DayResult>((resolve) => {
      resolveNewest = resolve;
    });
    const oldest = new Promise<DayResult>((resolve) => {
      resolveOldest = resolve;
    });

    vi.mocked(loadDay).mockImplementation((date: string) => {
      if (date === '2026-11-12') return newest;
      if (date === '2026-11-10') return oldest;
      return Promise.resolve({ date, articles: [] });
    });

    renderHome();

    await screen.findByRole('button', { name: 'Plus récents' });
    await userEvent.click(
      screen.getByRole('button', { name: 'Plus anciens' }),
    );
    await waitFor(() =>
      expect(loadDay).toHaveBeenCalledWith('2026-11-10'),
    );

    await act(async () => {
      resolveOldest({
        date: '2026-11-10',
        articles: [
          article('2026-11-10-oldest', 'Le plus ancien', '2026-11-10'),
        ],
      });
    });

    expect(await screen.findByText('Le plus ancien')).toBeInTheDocument();

    await act(async () => {
      resolveNewest({
        date: '2026-11-12',
        articles: [
          article('2026-11-12-stale', 'Article périmé', '2026-11-12'),
        ],
      });
    });

    await waitFor(() =>
      expect(screen.queryByText('Article périmé')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('Le plus ancien')).toBeInTheDocument();
  });

  it('switches the UI copy to Chinese while keeping article content in French', async () => {
    renderHome();

    await screen.findByText('La tour Eiffel');

    await act(async () => {
      await i18n.changeLanguage('zh');
    });

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      '法语阅读练习',
    );
    expect(screen.getByText('每天读一点法语')).toBeInTheDocument();
    expect(
      screen.queryByText('精选适合 A2–B2 水平的法语短文，边读边练。'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '全部' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: '近 3 天' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      screen.getByRole('button', { name: '最新在前' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('已加载 1 篇')).toBeInTheDocument();
    expect(screen.getByText('文化')).toBeInTheDocument();

    const title = screen.getByRole('heading', { name: 'La tour Eiffel' });
    expect(title).toHaveAttribute('lang', 'fr');
    expect(screen.getByText(/Un résumé de test/)).toHaveAttribute(
      'lang',
      'fr',
    );
  });

  it('shows the first-visit banner when onboarding has not been seen', async () => {
    localStorage.clear();

    renderHome();

    expect(
      await screen.findByRole('region', { name: 'Première visite' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: "Ouvrir l'aide" }),
    ).toHaveAttribute('href', '/aide');
    expect(screen.getByRole('button', { name: 'Fermer' })).toBeInTheDocument();

    // The banner must not replace the page content behind it.
    expect(await screen.findByText('La tour Eiffel')).toBeInTheDocument();
  });

  it('hides the first-visit banner once onboardingSeen is true', async () => {
    renderHome();

    await screen.findByText('La tour Eiffel');

    expect(
      screen.queryByRole('region', { name: 'Première visite' }),
    ).not.toBeInTheDocument();
  });

  it('falls back to the raw theme key for unknown themes', async () => {
    dayArticles['2026-11-12'] = [
      article('2026-11-12-repas', 'Le repas', TODAY, 'A2', 'gastronomie'),
    ];

    renderHome();

    await screen.findByText('Le repas');

    expect(screen.getByText('gastronomie')).toBeInTheDocument();
  });

  it('navigates to /read/:id when clicking a card', async () => {
    renderHome();

    const card = await screen.findByRole('link', { name: /La tour Eiffel/i });
    await userEvent.click(card);

    await waitFor(() => {
      expect(screen.getByTestId('read-page')).toBeInTheDocument();
    });
  });
});
