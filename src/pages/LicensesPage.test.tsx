import { describe, expect, it } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LicensesPage from './LicensesPage';
import { i18n } from '../i18n';

function renderPage() {
  return render(
    <MemoryRouter>
      <LicensesPage />
    </MemoryRouter>,
  );
}

describe('LicensesPage', () => {
  it('renders the French title and the article licence statement', () => {
    renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Licences et sources' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Les textes des articles sont publiés sous CC BY-SA 4\.0\./),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Licence du code' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Code © auteur, tous droits réservés\./),
    ).toBeInTheDocument();
  });

  it('links to CC BY-SA 4.0 and the full legal text in a new tab', () => {
    renderPage();

    const licenseLink = screen.getByRole('link', { name: 'CC BY-SA 4.0' });
    expect(licenseLink).toHaveAttribute(
      'href',
      'https://creativecommons.org/licenses/by-sa/4.0/',
    );
    expect(licenseLink).toHaveAttribute('target', '_blank');
    expect(licenseLink.getAttribute('rel')).toContain('noopener');
    expect(licenseLink.getAttribute('rel')).toContain('noreferrer');

    const legalCodeLink = screen.getByRole('link', {
      name: 'Texte complet de la licence',
    });
    expect(legalCodeLink).toHaveAttribute(
      'href',
      'https://creativecommons.org/licenses/by-sa/4.0/legalcode',
    );
    expect(legalCodeLink).toHaveAttribute('target', '_blank');
    expect(legalCodeLink.getAttribute('rel')).toContain('noopener');
    expect(legalCodeLink.getAttribute('rel')).toContain('noreferrer');
  });

  it('lists the three active content sources and no candidate sources', () => {
    renderPage();

    const sourceList = screen.getByRole('list', { name: 'Sources' });
    const items = within(sourceList).getAllByRole('listitem');
    expect(items).toHaveLength(3);

    const wikipediaLink = within(sourceList).getByRole('link', {
      name: /Wikipédia FR/,
    });
    expect(wikipediaLink).toHaveAttribute('href', 'https://fr.wikipedia.org/');
    expect(wikipediaLink).toHaveAttribute('target', '_blank');

    expect(
      within(sourceList).getAllByText(/^Licence d'origine : /),
    ).toHaveLength(3);
    expect(
      within(sourceList).getByText("Licence d'origine : CC BY-SA 4.0"),
    ).toBeInTheDocument();
    expect(
      within(sourceList).queryByRole('link', { name: /UNESCO/ }),
    ).not.toBeInTheDocument();
    expect(
      within(sourceList).queryByRole('link', { name: /Wikisource/ }),
    ).not.toBeInTheDocument();
  });

  it('states how to request removal in French', () => {
    renderPage();

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Contact et demandes de retrait',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/dépôt de code du projet/)).toBeInTheDocument();
  });

  it('switches the title, statements and source list to Chinese', async () => {
    renderPage();

    await act(async () => {
      await i18n.changeLanguage('zh');
    });

    expect(
      screen.getByRole('heading', { level: 1, name: '许可与来源' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/文章文本按 CC BY-SA 4\.0 发布/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: '代码许可' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/代码 © 作者，保留所有权利/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: '联系与删除请求' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/提交 issue/)).toBeInTheDocument();

    const sourceList = screen.getByRole('list', { name: '来源清单' });
    expect(within(sourceList).getAllByRole('listitem')).toHaveLength(3);
    expect(
      within(sourceList).getByText('原许可：CC BY-SA 4.0'),
    ).toBeInTheDocument();
  });
});
