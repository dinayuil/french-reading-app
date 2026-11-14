import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ArticleImage from './ArticleImage';
import type { ArticleImage as ArticleImageMeta } from '../types/content';

const image: ArticleImageMeta = {
  path: 'images/2026-11-09-tour-eiffel-0123456789ab.jpg',
  alt: 'La tour Eiffel vue depuis le Champ-de-Mars',
  author: 'Jane Doe',
  sourceUrl:
    'https://commons.wikimedia.org/wiki/File:Tour_Eiffel_Champ_de_Mars.jpg?oldid=123456789',
  license: 'CC BY-SA 3.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
  changes: 'Version 960 × 1298 px.',
  width: 1200,
  height: 800,
  byteLength: 345_678,
  sha256: '0123456789abcdef'.repeat(4),
  fileRevisionId: '123456789',
  retrievedAt: '2026-11-14',
};

const replacement: ArticleImageMeta = {
  ...image,
  path: 'images/2026-11-09-tour-eiffel-ffffffffffff.png',
  sha256: 'f'.repeat(64),
  license: 'CC0 1.0',
  licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
};

describe('ArticleImage', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the image with its independent licence and Commons credit', () => {
    const { container } = render(<ArticleImage image={image} />);

    const img = screen.getByRole('img', { name: image.alt });
    expect(img).toHaveAttribute('src', `/data/${image.path}`);
    expect(img).toHaveAttribute('alt', image.alt);
    expect(img).toHaveAttribute('width', String(image.width));
    expect(img).toHaveAttribute('height', String(image.height));
    expect(img).toHaveAttribute('loading', 'lazy');

    const credit = screen.getByTestId('article-image-credit');
    expect(credit).toHaveAttribute('lang', 'fr');
    expect(credit).not.toHaveTextContent('©');

    const caption = screen.getByTestId('article-image-caption');
    expect(caption).toHaveTextContent(
      'Photo : Jane Doe · Wikimedia Commons · CC BY-SA 3.0',
    );
    expect(caption).not.toHaveTextContent('Version');
    expect(caption).not.toHaveTextContent('960');
    expect(caption).not.toHaveTextContent('1298');

    expect(container.querySelector('details')).toBeNull();
    expect(
      screen.queryByText('Informations sur la photo'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(image.changes)).not.toBeInTheDocument();

    const commons = screen.getByRole('link', { name: 'Wikimedia Commons' });
    expect(commons).toHaveAttribute('href', image.sourceUrl);
    expect(commons).toHaveAttribute('target', '_blank');
    expect(commons).toHaveAttribute('rel', 'noopener noreferrer');

    const license = screen.getByRole('link', { name: image.license });
    expect(license).toHaveAttribute('href', image.licenseUrl);
    expect(license).toHaveAttribute('target', '_blank');
    expect(license).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('hides the whole figure and credit when the image fails to load', () => {
    const { container, rerender } = render(<ArticleImage image={image} />);

    fireEvent.error(screen.getByRole('img', { name: image.alt }));

    expect(screen.queryByRole('img', { name: image.alt })).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('article-image-credit'),
    ).not.toBeInTheDocument();
    expect(container.querySelector('figure')).toBeNull();

    rerender(<ArticleImage image={image} />);
    expect(screen.queryByRole('img', { name: image.alt })).not.toBeInTheDocument();
  });

  it('resets the failure when the image path changes', () => {
    const { rerender } = render(<ArticleImage image={image} />);

    fireEvent.error(screen.getByRole('img', { name: image.alt }));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();

    rerender(<ArticleImage image={replacement} />);

    expect(
      screen.getByRole('img', { name: replacement.alt }),
    ).toHaveAttribute('src', `/data/${replacement.path}`);
    expect(screen.getByTestId('article-image-caption')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: replacement.license }),
    ).toHaveAttribute('href', replacement.licenseUrl);
  });
});
