import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

vi.mock('./pages/HomePage', () => ({
  default: () => <div data-testid="home-page">Home page</div>,
}));

vi.mock('./pages/StatsPage', () => ({
  default: () => <h1>Stats page marker</h1>,
}));

vi.mock('./pages/SettingsPage', () => ({
  default: () => <h1>Settings page marker</h1>,
}));

vi.mock('./pages/ReadPage', () => ({
  default: () => <div data-testid="read-page">Read page</div>,
}));

vi.mock('./pages/PracticePage', () => ({
  default: () => <div data-testid="practice-page">Practice page</div>,
}));

vi.mock('./pages/HelpPage', () => ({
  default: () => <div data-testid="help-page">Help page</div>,
}));

vi.mock('./pages/LicensesPage', () => ({
  default: () => <div data-testid="licenses-page">Licenses page</div>,
}));

function renderAt(path: string) {
  window.history.pushState({}, '', path);
  return render(<App />);
}

afterEach(() => {
  window.history.pushState({}, '', '/');
});

describe('App routes', () => {
  it('redirects the old /data address to the statistics page', () => {
    renderAt('/data');

    expect(
      screen.getByRole('heading', { level: 1, name: 'Stats page marker' }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe('/stats');
    expect(
      screen.getByRole('link', { name: 'Statistiques' }),
    ).toHaveAttribute('aria-current', 'page');
  });

  it('navigates to the statistics and settings pages from the navigation', async () => {
    renderAt('/');
    expect(screen.getByTestId('home-page')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: 'Statistiques' }));

    expect(
      screen.getByRole('heading', { level: 1, name: 'Stats page marker' }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe('/stats');

    await userEvent.click(screen.getByRole('link', { name: 'Paramètres' }));

    expect(
      screen.getByRole('heading', { level: 1, name: 'Settings page marker' }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe('/settings');
  });

  it.each([
    ['/aide', 'help-page'],
    ['/licences', 'licenses-page'],
  ])('keeps the direct address %s reachable', (path, testId) => {
    renderAt(path);

    expect(screen.getByTestId(testId)).toBeInTheDocument();
  });
});
