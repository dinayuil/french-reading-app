import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Layout from './Layout';
import { createMatchMediaController } from '../test/matchMedia';

function renderLayout(
  initialEntry = '/',
  { mobile = false }: { mobile?: boolean } = {},
) {
  const media = createMatchMediaController(mobile);
  vi.stubGlobal('matchMedia', media.matchMedia);

  const view = render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route element={<Layout />}>
          <Route
            path="/"
            element={<div data-testid="home-page">Home page</div>}
          />
          <Route
            path="/stats"
            element={
              <div data-testid="stats-page">
                Stats page
                <button type="button">Contenu suivant</button>
              </div>
            }
          />
          <Route
            path="/settings"
            element={<div data-testid="settings-page">Settings page</div>}
          />
          <Route
            path="/licences"
            element={<div data-testid="licenses-page">Licenses page</div>}
          />
          <Route
            path="/mots"
            element={<div data-testid="vocabulary-page">Vocabulary page</div>}
          />
          <Route
            path="/read/:id"
            element={<div data-testid="read-page">Read page</div>}
          />
          <Route
            path="/practice/:id"
            element={<div data-testid="practice-page">Practice page</div>}
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

  return { ...view, media };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Layout', () => {
  it('renders one four-entry desktop navigation and no licenses links', () => {
    const { container } = renderLayout();
    const navigations = screen.getAllByRole('navigation');

    expect(navigations).toHaveLength(1);
    const navigation = navigations[0];
    expect(navigation).toHaveClass('top-bar__nav');
    expect(
      within(navigation).getByRole('link', { name: 'Lectures' }),
    ).toHaveAttribute('href', '/');
    expect(
      within(navigation).getByRole('link', { name: 'Statistiques' }),
    ).toHaveAttribute('href', '/stats');
    expect(
      within(navigation).getByRole('link', { name: 'Mots' }),
    ).toHaveAttribute('href', '/mots');
    expect(
      within(navigation).getByRole('link', { name: 'Paramètres' }),
    ).toHaveAttribute('href', '/settings');
    expect(
      within(navigation).queryByRole('link', { name: 'Aide' }),
    ).not.toBeInTheDocument();
    expect(
      within(navigation).queryByRole('link', { name: 'Licences' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Licences' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: "Langue de l'interface" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`© ${new Date().getFullYear()} Lire en français`),
    ).toBeInTheDocument();
    expect(container.querySelector('.tab-bar')).toBeNull();
  });

  it('switches the desktop navigation to Chinese without leaving the current route', async () => {
    renderLayout();

    await userEvent.click(screen.getByRole('button', { name: '中文' }));

    expect(screen.getByRole('link', { name: '阅读' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '统计' })).toHaveAttribute(
      'href',
      '/stats',
    );
    expect(screen.getByRole('link', { name: '生词' })).toHaveAttribute(
      'href',
      '/mots',
    );
    expect(screen.getByRole('link', { name: '设置' })).toHaveAttribute(
      'href',
      '/settings',
    );
    expect(screen.queryByRole('link', { name: '帮助' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '许可' })).not.toBeInTheDocument();
    expect(screen.getByTestId('home-page')).toBeInTheDocument();
    expect(screen.queryByTestId('licenses-page')).not.toBeInTheDocument();
  });

  it('marks the statistics entry as the current page on its route', () => {
    renderLayout('/stats');

    expect(
      screen.getByRole('link', { name: 'Statistiques' }),
    ).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('stats-page')).toBeInTheDocument();
  });

  it('marks the settings entry as the current page on its route', () => {
    renderLayout('/settings');

    expect(
      screen.getByRole('link', { name: 'Paramètres' }),
    ).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('settings-page')).toBeInTheDocument();
  });

  it('renders one mobile tab bar, the compact header and no footer', () => {
    const { container } = renderLayout('/', { mobile: true });
    const navigations = screen.getAllByRole('navigation');

    expect(navigations).toHaveLength(1);
    const navigation = navigations[0];
    expect(navigation).toHaveClass('tab-bar');
    const links = within(navigation).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'Lectures',
      'Statistiques',
      'Mots',
      'Paramètres',
    ]);
    expect(
      within(navigation).queryByRole('link', { name: 'Licences' }),
    ).not.toBeInTheDocument();
    expect(container.querySelector('.mobile-top-bar')).not.toBeNull();
    expect(container.querySelector('.top-bar')).toBeNull();
    expect(container.querySelector('.site-footer')).toBeNull();
    expect(container.querySelector('.layout__main')).toHaveClass(
      'layout__main--tabbar',
    );
    expect(screen.getByRole('link', { name: 'Lire en français' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(
      screen.getByRole('button', {
        name: 'Changer la langue (français)',
      }),
    ).toBeInTheDocument();
  });

  it('marks the active mobile tab on its route', () => {
    renderLayout('/stats', { mobile: true });

    expect(
      screen.getByRole('link', { name: 'Statistiques' }),
    ).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('stats-page')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Lectures' }),
    ).not.toHaveAttribute('aria-current');
  });

  it('marks the vocabulary tab on its route', () => {
    renderLayout('/mots', { mobile: true });

    expect(
      screen.getByRole('link', { name: 'Mots' }),
    ).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('vocabulary-page')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Statistiques' }),
    ).not.toHaveAttribute('aria-current');
  });

  it('opens the language menu, supports arrow keys and closes on selection', async () => {
    renderLayout('/stats', { mobile: true });
    const trigger = screen.getByRole('button', {
      name: 'Changer la langue (français)',
    });

    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('menu', {
      name: "Langue de l'interface",
    });
    const french = within(menu).getByRole('menuitemradio', {
      name: 'Français',
    });
    const chinese = within(menu).getByRole('menuitemradio', {
      name: '中文',
    });

    expect(french).toHaveAttribute('aria-checked', 'true');
    expect(french).toHaveFocus();

    await userEvent.keyboard('{ArrowDown}');
    expect(chinese).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    expect(french).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('{Enter}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(screen.getByTestId('stats-page')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: '统计' }),
    ).toHaveAttribute('aria-current', 'page');
  });

  it('closes the language menu on Escape and returns focus to the trigger', async () => {
    renderLayout('/', { mobile: true });
    const trigger = screen.getByRole('button', {
      name: 'Changer la langue (français)',
    });

    await userEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });

  it('closes the language menu on Tab and continues in document order', async () => {
    renderLayout('/stats', { mobile: true });
    const trigger = screen.getByRole('button', {
      name: 'Changer la langue (français)',
    });
    const wordmark = screen.getByRole('link', { name: 'Lire en français' });

    await userEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await userEvent.tab();

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Contenu suivant' }),
    ).toHaveFocus();

    await userEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await userEvent.tab({ shift: true });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(wordmark).toHaveFocus();
  });

  it('closes the language menu when clicking outside it', async () => {
    renderLayout('/', { mobile: true });
    await userEvent.click(
      screen.getByRole('button', { name: 'Changer la langue (français)' }),
    );
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('home-page'));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('replaces the mobile shell with the desktop navigation at the breakpoint', async () => {
    const { media } = renderLayout('/', { mobile: true });
    await userEvent.click(
      screen.getByRole('button', { name: 'Changer la langue (français)' }),
    );
    expect(screen.getByRole('menu')).toBeInTheDocument();

    act(() => {
      media.setMobile(false);
    });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Changer la langue/ }),
    ).not.toBeInTheDocument();
    const navigation = screen.getByRole('navigation');
    expect(navigation).toHaveClass('top-bar__nav');
    expect(
      screen.getByText(`© ${new Date().getFullYear()} Lire en français`),
    ).toBeInTheDocument();
  });

  it.each(['/read/abc', '/practice/abc'])(
    'hides the bottom tab bar and its spacing on %s',
    (entry) => {
      const { container } = renderLayout(entry, { mobile: true });

      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
      expect(container.querySelector('.tab-bar')).toBeNull();
      expect(container.querySelector('.layout__main--tabbar')).toBeNull();
      expect(container.querySelector('.mobile-top-bar')).not.toBeNull();
      expect(
        screen.getByTestId(
          entry.startsWith('/read') ? 'read-page' : 'practice-page',
        ),
      ).toBeInTheDocument();
    },
  );
});
