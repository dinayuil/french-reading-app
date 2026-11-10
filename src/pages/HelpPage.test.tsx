import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HelpPage from './HelpPage';
import { i18n } from '../i18n';

function renderHelp() {
  return render(
    <MemoryRouter initialEntries={['/aide']}>
      <HelpPage />
    </MemoryRouter>,
  );
}

const FRENCH_SECTIONS = [
  'Lecture',
  'Exercices',
  "Langue de l'interface",
  'Données',
  'Licences',
];

const CHINESE_SECTIONS = ['阅读', '练习', '界面语言', '数据', '许可'];

describe('HelpPage', () => {
  it('renders the French title and the five sections', () => {
    renderHelp();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Aide' }),
    ).toBeInTheDocument();

    for (const section of FRENCH_SECTIONS) {
      expect(
        screen.getByRole('heading', { level: 2, name: section }),
      ).toBeInTheDocument();
    }
  });

  it('explains the practice rules, including no help before submitting', () => {
    renderHelp();

    expect(
      screen.getByText(
        /aucune aide ni traduction n'est disponible avant de valider vos réponses/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/chronomètre peut être masqué/i)).toBeInTheDocument();
    expect(screen.getByText(/mots marqués/i)).toBeInTheDocument();
    expect(
      screen.getByText(/chaque tentative validée est enregistrée/i),
    ).toBeInTheDocument();
  });

  it('switches every section and the practice rules to Chinese', async () => {
    renderHelp();

    await act(async () => {
      await i18n.changeLanguage('zh');
    });

    expect(
      screen.getByRole('heading', { level: 1, name: '帮助' }),
    ).toBeInTheDocument();

    for (const section of CHINESE_SECTIONS) {
      expect(
        screen.getByRole('heading', { level: 2, name: section }),
      ).toBeInTheDocument();
    }

    expect(
      screen.getByText(/交卷前不提供任何解释或翻译/),
    ).toBeInTheDocument();
    expect(screen.getByText(/计时器可以隐藏/)).toBeInTheDocument();
    expect(screen.getByText(/标记的生词/)).toBeInTheDocument();
    expect(screen.getByText(/每次记录都会保留/)).toBeInTheDocument();
  });

  it('links to the licenses page and back to the reading list', () => {
    renderHelp();

    expect(
      screen.getByRole('link', { name: 'Voir les licences' }),
    ).toHaveAttribute('href', '/licences');
    expect(
      screen.getByRole('link', { name: 'Retour aux lectures' }),
    ).toHaveAttribute('href', '/');
  });
});
