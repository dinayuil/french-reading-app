import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

vi.mock('./pages/HomePage', () => ({
  default: () => <div data-testid="home-page">Home page</div>,
}));

vi.mock('./pages/DataPage', () => ({
  default: () => <h1>Data page marker</h1>,
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
  it('renders the data page on /data inside the shared layout', () => {
    renderAt('/data');

    expect(
      screen.getByRole('heading', { level: 1, name: 'Data page marker' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Mes données' }),
    ).toHaveAttribute('aria-current', 'page');
  });

  it('navigates to the data page from the navigation', async () => {
    renderAt('/');
    expect(screen.getByTestId('home-page')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: 'Mes données' }));

    expect(
      screen.getByRole('heading', { level: 1, name: 'Data page marker' }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe('/data');
  });
});
