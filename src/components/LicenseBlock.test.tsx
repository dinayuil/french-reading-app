import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import LicenseBlock from './LicenseBlock';
import type { Article } from '../types/content';

const article: Article = {
  id: '2026-11-09-tour-eiffel',
  title: 'La tour Eiffel',
  level: 'B1',
  theme: 'culture',
  date: '2026-11-09',
  summary: 'Un article de test.',
  paragraphs: [],
  glossary: [],
  questions: [],
  translations: {
    zh: {
      title: '埃菲尔铁塔',
      summary: '摘要。',
      paragraphs: [],
      glossary: {},
      questions: {},
    },
  },
  source: {
    site: 'Wikipédia en français',
    title: 'Tour Eiffel',
    authors: ['Contributeurs de Wikipédia'],
    url: 'https://fr.wikipedia.org/wiki/Tour_Eiffel',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    retrievedAt: '2026-11-09',
    revisionId: '241075004',
  },
  adaptation: {
    model: 'rédaction interne',
    date: '2026-11-09',
    changes: 'Version simplifiée au niveau B1.',
    reviewer: 'révision éditoriale',
  },
  license: {
    name: 'CC BY-SA 4.0',
    url: 'https://creativecommons.org/licenses/by-sa/4.0/',
  },
};

describe('LicenseBlock', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders source title, authors, source link with target and rel', () => {
    render(<LicenseBlock article={article} />);

    const sourceLink = screen.getByRole('link', { name: article.source.title });
    expect(sourceLink).toHaveAttribute('href', article.source.url);
    expect(sourceLink).toHaveAttribute('target', '_blank');
    expect(sourceLink).toHaveAttribute('rel', 'noopener noreferrer');

    expect(screen.getByText(/Contributeurs de Wikipédia/)).toBeInTheDocument();
  });

  it('renders the original license link', () => {
    render(<LicenseBlock article={article} />);

    const licenseLinks = screen.getAllByRole('link', { name: 'CC BY-SA 4.0' });
    expect(licenseLinks).toHaveLength(2);
    const licenseLink = licenseLinks[0];
    expect(licenseLink).toHaveAttribute('href', article.source.licenseUrl);
    expect(licenseLink).toHaveAttribute('target', '_blank');
    expect(licenseLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders adaptation note and reviewer/date', () => {
    render(<LicenseBlock article={article} />);

    expect(screen.getByText(/Version simplifiée au niveau B1/)).toBeInTheDocument();
    expect(screen.getByText(/révision éditoriale/)).toBeInTheDocument();
    expect(screen.getByText(/2026-11-09/)).toBeInTheDocument();
  });

  it('renders the adaptation license link and disclaimer', () => {
    render(<LicenseBlock article={article} />);

    const adaptationLink = screen.getAllByRole('link', { name: 'CC BY-SA 4.0' })[1];
    expect(adaptationLink).toHaveAttribute('href', article.license.url);

    expect(
      screen.getByText(/Aucune approbation par l'auteur original\./),
    ).toBeInTheDocument();
  });

  it('renders Modifications label', () => {
    render(<LicenseBlock article={article} />);

    expect(screen.getByText(/Modifications :/)).toBeInTheDocument();
  });

  it('labels the block with the localized attribution label', () => {
    render(<LicenseBlock article={article} />);

    expect(
      screen.getByRole('complementary', { name: 'Attribution et licence' }),
    ).toBeInTheDocument();
  });
});
