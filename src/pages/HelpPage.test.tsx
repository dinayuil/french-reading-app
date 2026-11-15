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
];

const CHINESE_SECTIONS = ['阅读', '练习', '界面语言', '数据'];

describe('HelpPage', () => {
  it('renders the French title and the four sections', () => {
    renderHelp();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Aide' }),
    ).toBeInTheDocument();

    for (const section of FRENCH_SECTIONS) {
      expect(
        screen.getByRole('heading', { level: 2, name: section }),
      ).toBeInTheDocument();
    }
    expect(
      screen.queryByRole('heading', { level: 2, name: 'Licences' }),
    ).not.toBeInTheDocument();
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
    expect(screen.getByText(/许可与来源可在设置的/)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: '查看统计' }),
    ).toHaveAttribute('href', '/stats');
    expect(
      screen.getByRole('link', { name: '打开设置' }),
    ).toHaveAttribute('href', '/settings');
    expect(
      screen.getByRole('link', { name: '打开单词本' }),
    ).toHaveAttribute('href', '/mots');
  });

  it('explains backups, WebDAV and links to statistics and settings', () => {
    renderHelp();

    expect(screen.getByText(/exporter une sauvegarde/i)).toBeInTheDocument();
    expect(screen.getByText(/dossier WebDAV/i)).toBeInTheDocument();
    expect(
      screen.getByText(/licences et sources sont accessibles/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Voir les statistiques' }),
    ).toHaveAttribute('href', '/stats');
    expect(
      screen.getByRole('link', { name: 'Ouvrir les paramètres' }),
    ).toHaveAttribute('href', '/settings');
  });

  it('does not duplicate the licenses entry and links back to the reading list', () => {
    renderHelp();

    expect(
      screen.queryByRole('link', { name: 'Voir les licences' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Licences' })).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Retour aux lectures' }),
    ).toHaveAttribute('href', '/');
  });
});
