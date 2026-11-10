import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import SourceAttribution from './SourceAttribution';
import type { Article } from '../types/content';

const article: Article = {
  id: '2026-11-10-madagascar',
  title: 'Madagascar et la biodiversité',
  level: 'B2',
  theme: 'environnement',
  date: '2026-11-10',
  summary: 'Un article de test.',
  paragraphs: [],
  glossary: [],
  questions: [],
  translations: {
    zh: {
      title: '马达加斯加与生物多样性',
      summary: '测试摘要。',
      paragraphs: [],
      glossary: {},
      questions: {},
    },
  },
  source: {
    site: 'Global Voices en Français',
    title: 'Madagascar s’engage pour la biodiversité',
    authors: ['Mamisoa Raveloaritiana'],
    url: 'https://fr.globalvoices.org/2026/11/09/304239/',
    license: 'CC BY 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
    retrievedAt: '2026-11-10',
    publishedAt: '2026-11-09',
    attributionPosition: 'top',
  },
  adaptation: {
    model: 'deepseek-v4.1-flash',
    date: '2026-11-10',
    changes: 'Simplifié au niveau B2.',
    reviewer: 'glm-5.3-flash',
  },
  license: {
    name: 'CC BY-SA 4.0',
    url: 'https://creativecommons.org/licenses/by-sa/4.0/',
  },
};

describe('SourceAttribution', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the author, original publication date and source link', () => {
    render(<SourceAttribution article={article} />);

    expect(screen.getByText(/Mamisoa Raveloaritiana/)).toBeInTheDocument();
    expect(screen.getByText(/2026-11-09/)).toBeInTheDocument();
    expect(screen.queryByText(/2026-11-10/)).not.toBeInTheDocument();

    const link = screen.getByRole('link', { name: article.source.title });
    expect(link).toHaveAttribute('href', article.source.url);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders the level and adaptation license', () => {
    render(<SourceAttribution article={article} />);

    expect(screen.getByText(/niveau B2/)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'CC BY-SA 4.0' }),
    ).toHaveAttribute('href', article.license.url);
  });
});
