import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import VocabularyPage from './VocabularyPage';
import {
  addVocabulary,
  listVocabulary,
} from '../features/vocabulary/vocabulary';
import { i18n } from '../i18n';

function renderPage() {
  return render(
    <MemoryRouter>
      <VocabularyPage />
    </MemoryRouter>,
  );
}

function seedEntries() {
  addVocabulary({
    term: 'flâner',
    translation: '漫步，闲逛',
    context: 'Il aime flâner le long de la Seine.',
    articleId: '2026-11-09-tour-eiffel',
    articleTitle: 'La tour Eiffel',
  });
  addVocabulary({
    term: 'situé',
    context: 'La tour Eiffel est un grand monument situé à Paris.',
    articleId: '2026-11-10-paris',
    articleTitle: 'Un matin à Paris',
  });
}

describe('VocabularyPage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage('fr');
    });
    localStorage.clear();
  });

  it('shows an empty notebook with a way back to reading', () => {
    renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Mon carnet de mots' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Votre carnet est vide' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Lire un article' }),
    ).toHaveAttribute('href', '/');
  });

  it('lists entries with translation, French context and the source article', () => {
    seedEntries();
    renderPage();

    const entry = screen.getByRole('article', { name: 'flâner' });
    expect(within(entry).getByText('漫步，闲逛')).toBeInTheDocument();
    expect(
      within(entry).getByText('Il aime flâner le long de la Seine.'),
    ).toHaveAttribute('lang', 'fr');
    expect(
      within(entry).getByRole('link', { name: /La tour Eiffel/ }),
    ).toHaveAttribute('href', '/read/2026-11-09-tour-eiffel');
    expect(within(entry).getByText(/Ajouté le/)).toBeInTheDocument();
    expect(screen.getByText('2 mots enregistrés')).toBeInTheDocument();
  });

  it('filters by term, translation and source title', async () => {
    seedEntries();
    renderPage();

    const search = screen.getByLabelText('Rechercher dans le carnet');
    await userEvent.type(search, 'paris');

    expect(
      screen.getByRole('article', { name: 'situé' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('article', { name: 'flâner' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('1 résultat(s)')).toBeInTheDocument();

    await userEvent.clear(search);
    await userEvent.type(search, 'flâner');
    expect(
      screen.getByRole('article', { name: 'flâner' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('article', { name: 'situé' }),
    ).not.toBeInTheDocument();
  });

  it('edits and saves a translation', async () => {
    seedEntries();
    renderPage();

    const entry = screen.getByRole('article', { name: 'flâner' });
    await userEvent.click(
      within(entry).getByRole('button', {
        name: 'Modifier la traduction : flâner',
      }),
    );

    const field = within(entry).getByLabelText('Traduction de « flâner »');
    await userEvent.clear(field);
    await userEvent.type(field, '悠闲地散步');
    await userEvent.click(
      within(entry).getByRole('button', { name: 'Enregistrer' }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Traduction enregistrée.',
    );
    expect(
      listVocabulary().find((item) => item.term === 'flâner')?.translation,
    ).toBe('悠闲地散步');
    expect(within(entry).getByText('悠闲地散步')).toBeInTheDocument();
  });

  it('deletes only after an inline confirmation and keeps the deletion stored', async () => {
    seedEntries();
    renderPage();

    const entry = screen.getByRole('article', { name: 'flâner' });
    await userEvent.click(
      within(entry).getByRole('button', { name: 'Supprimer' }),
    );

    expect(
      within(entry).getByText('Supprimer « flâner » ?'),
    ).toBeInTheDocument();
    expect(listVocabulary()).toHaveLength(2);

    await userEvent.click(
      within(entry).getByRole('button', { name: 'Supprimer définitivement' }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Mot supprimé.',
    );
    expect(listVocabulary()).toHaveLength(1);
    expect(
      screen.queryByRole('article', { name: 'flâner' }),
    ).not.toBeInTheDocument();
  });

  it('switches the notebook interface to Chinese', async () => {
    seedEntries();
    await act(async () => {
      await i18n.changeLanguage('zh');
    });
    renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: '我的单词本' }),
    ).toBeInTheDocument();
    expect(screen.getByText('共 2 个词条')).toBeInTheDocument();
    expect(
      screen.getByLabelText('搜索单词本'),
    ).toBeInTheDocument();
    const entry = screen.getByRole('article', { name: 'flâner' });
    expect(
      within(entry).getByRole('button', { name: /修改释义.*flâner/ }),
    ).toBeInTheDocument();
  });
});
