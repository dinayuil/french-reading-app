import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Layout from './Layout';

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<Layout />}>
          <Route
            path="/"
            element={<div data-testid="home-page">Home page</div>}
          />
          <Route
            path="/licences"
            element={<div data-testid="licenses-page">Licenses page</div>}
          />
          <Route
            path="/aide"
            element={<div data-testid="help-page">Help page</div>}
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('Layout', () => {
  it('renders the French navigation, language switch and footer', () => {
    renderLayout();

    expect(screen.getByRole('link', { name: 'Lectures' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(screen.getByRole('link', { name: 'Aide' })).toHaveAttribute(
      'href',
      '/aide',
    );
    expect(screen.getByRole('link', { name: 'Licences' })).toHaveAttribute(
      'href',
      '/licences',
    );
    expect(
      screen.getByRole('group', { name: "Langue de l'interface" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`© ${new Date().getFullYear()} Lire en français`),
    ).toBeInTheDocument();
  });

  it('switches the navigation to Chinese without leaving the current route', async () => {
    renderLayout();

    await userEvent.click(screen.getByRole('button', { name: '中文' }));

    expect(screen.getByRole('link', { name: '阅读' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '帮助' })).toHaveAttribute(
      'href',
      '/aide',
    );
    expect(screen.getByRole('link', { name: '许可' })).toBeInTheDocument();
    expect(screen.getByTestId('home-page')).toBeInTheDocument();
    expect(screen.queryByTestId('licenses-page')).not.toBeInTheDocument();
  });
});
