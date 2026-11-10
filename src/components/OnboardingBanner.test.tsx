import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import OnboardingBanner from './OnboardingBanner';
import type { Settings } from '../types/progress';

function seedSettings(settings: Partial<Settings>) {
  localStorage.setItem('frp:settings', JSON.stringify(settings));
}

function storedSettings(): Settings {
  return JSON.parse(localStorage.getItem('frp:settings') ?? '{}') as Settings;
}

function renderBanner() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<OnboardingBanner />} />
        <Route
          path="/aide"
          element={<div data-testid="help-page">Help page</div>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('OnboardingBanner', () => {
  it('renders the title, body and both actions when onboarding was not seen', () => {
    seedSettings({ onboardingSeen: false });

    renderBanner();

    expect(
      screen.getByRole('region', { name: 'Première visite' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/L'aide explique la lecture, les exercices/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: "Ouvrir l'aide" }),
    ).toHaveAttribute('href', '/aide');
    expect(screen.getByRole('button', { name: 'Fermer' })).toBeInTheDocument();
  });

  it('hides itself and persists onboardingSeen after Fermer', async () => {
    seedSettings({ onboardingSeen: false });

    const { unmount } = renderBanner();

    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));

    expect(
      screen.queryByRole('region', { name: 'Première visite' }),
    ).not.toBeInTheDocument();
    expect(storedSettings().onboardingSeen).toBe(true);

    unmount();
    renderBanner();

    expect(
      screen.queryByRole('region', { name: 'Première visite' }),
    ).not.toBeInTheDocument();
  });

  it("persists onboardingSeen when following Ouvrir l'aide", async () => {
    seedSettings({ onboardingSeen: false });

    renderBanner();

    await userEvent.click(screen.getByRole('link', { name: "Ouvrir l'aide" }));

    expect(await screen.findByTestId('help-page')).toBeInTheDocument();
    expect(storedSettings().onboardingSeen).toBe(true);
  });
});
