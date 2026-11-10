import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import HomePage from './HomePage';
import { i18n } from '../i18n';
import { loadManifest, loadMonth } from '../lib/content';
import type { Manifest, MonthIndex } from '../types/content';

vi.mock('../lib/content', () => ({
  loadManifest: vi.fn(),
  loadMonth: vi.fn(),
}));

const mockManifest: Manifest = {
  months: ['2026-11'],
};

const mockMonth: MonthIndex = {
  month: '2026-11',
  articles: [
    {
      id: '2026-11-09-tour-eiffel',
      title: 'La tour Eiffel',
      level: 'B1',
      theme: 'culture',
      date: '2026-11-09',
      summary:
        "L'histoire de la tour Eiffel, de sa construction à son rôle de symbole de Paris.",
      path: 'articles/2026-11-09-tour-eiffel.json',
    },
  ],
};

const mockMonthTwo: MonthIndex = {
  month: '2026-11',
  articles: [
    ...mockMonth.articles,
    {
      id: '2026-11-05-cafe',
      title: 'Le café en France',
      level: 'A2',
      theme: 'gastronomie',
      date: '2026-11-05',
      summary: 'Une boisson devenue un rituel quotidien.',
      path: 'articles/2026-11-05-cafe.json',
    },
  ],
};

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route
          path="/read/:id"
          element={<div data-testid="read-page">Read page</div>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('HomePage', () => {
  beforeEach(() => {
    localStorage.setItem(
      'frp:settings',
      JSON.stringify({ onboardingSeen: true }),
    );
    vi.mocked(loadManifest).mockReset();
    vi.mocked(loadMonth).mockReset();
    vi.mocked(loadManifest).mockResolvedValue(mockManifest);
    vi.mocked(loadMonth).mockResolvedValue(mockMonth);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the French hero, filter, count and card in French', async () => {
    renderHome();

    expect(
      await screen.findByText('La tour Eiffel'),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Lecture en français',
    );
    expect(
      screen.getByText(
        'Des textes en français, du niveau A2 au B2, à lire et à pratiquer.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tous' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('1 article')).toBeInTheDocument();
    expect(screen.getByTestId('level-badge')).toHaveTextContent('B1');
    expect(
      screen.getByText(/L'histoire de la tour Eiffel/),
    ).toBeInTheDocument();
    expect(screen.getByText('Culture')).toBeInTheDocument();

    expect(loadManifest).toHaveBeenCalledTimes(1);
    expect(loadMonth).toHaveBeenCalledWith('2026-11');
  });

  it('uses the plural form and filters by level', async () => {
    vi.mocked(loadMonth).mockResolvedValue(mockMonthTwo);

    renderHome();

    expect(await screen.findByText('2 articles')).toBeInTheDocument();
    expect(screen.getByText('Le café en France')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'A2' }));

    expect(screen.getByText('1 article')).toBeInTheDocument();
    expect(screen.getByText('Le café en France')).toBeInTheDocument();
    expect(screen.queryByText('La tour Eiffel')).not.toBeInTheDocument();
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
    vi.mocked(loadMonth).mockResolvedValue(mockMonthTwo);

    renderHome();

    await screen.findByText('Le café en France');

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

  it('switches the UI copy to Chinese while keeping article content in French', async () => {
    renderHome();

    await screen.findByText('La tour Eiffel');

    await act(async () => {
      await i18n.changeLanguage('zh');
    });

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      '法语阅读练习',
    );
    expect(screen.getByRole('button', { name: '全部' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('共 1 篇')).toBeInTheDocument();
    expect(screen.getByText('文化')).toBeInTheDocument();

    const title = screen.getByRole('heading', { name: 'La tour Eiffel' });
    expect(title).toHaveAttribute('lang', 'fr');
    expect(
      screen.getByText(/L'histoire de la tour Eiffel/),
    ).toHaveAttribute('lang', 'fr');
  });

  it('shows a localized error state with expandable technical details', async () => {
    vi.mocked(loadManifest).mockRejectedValue(new Error('network down'));

    renderHome();

    expect(
      await screen.findByRole('heading', {
        name: 'Impossible de charger la liste',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Vérifiez votre connexion, puis réessayez.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Réessayer' }),
    ).toBeInTheDocument();

    const detail = screen.getByText('network down');
    const details = detail.closest('details');
    expect(details).not.toBeNull();
    expect(screen.getByText('Détail technique')).toBeInTheDocument();
    expect(details).not.toHaveAttribute('open');

    await userEvent.click(screen.getByText('Détail technique'));

    expect(details).toHaveAttribute('open');
    expect(loadMonth).not.toHaveBeenCalled();
  });

  it('re-calls the loader when retry is clicked', async () => {
    vi.mocked(loadManifest)
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(mockManifest);

    renderHome();

    const retryButton = await screen.findByRole('button', {
      name: 'Réessayer',
    });
    await userEvent.click(retryButton);

    await waitFor(() => {
      expect(screen.getByText('La tour Eiffel')).toBeInTheDocument();
    });

    expect(loadManifest).toHaveBeenCalledTimes(2);
  });
});
