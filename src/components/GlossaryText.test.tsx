import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GlossaryText from './GlossaryText';
import type { GlossaryEntry } from '../types/content';

const glossary: GlossaryEntry[] = [
  { term: 'situé' },
  { term: 'au bord de' },
  { term: 'Pendant' },
];

describe('GlossaryText', () => {
  const onLookup = vi.fn();

  beforeEach(() => {
    onLookup.mockClear();
  });

  it('renders a sentence with one term as a button', () => {
    render(
      <GlossaryText
        text="La tour Eiffel est situé à Paris."
        glossary={glossary}
        onLookup={onLookup}
      />,
    );

    const termButton = screen.getByRole('button', { name: /situé/ });
    expect(termButton).toBeInTheDocument();
    expect(termButton).toHaveTextContent('situé');

    const container = termButton.parentElement;
    expect(container).toHaveTextContent('La tour Eiffel est situé à Paris.');
  });

  it('uses the bare term as the accessible name when no label builder is given', () => {
    render(
      <GlossaryText
        text="La tour Eiffel est situé à Paris."
        glossary={glossary}
        onLookup={onLookup}
      />,
    );

    expect(screen.getByRole('button', { name: 'situé' })).toBeInTheDocument();
  });

  it('uses ariaLabelForTerm for the term accessible name when provided', () => {
    render(
      <GlossaryText
        text="La tour Eiffel est situé à Paris."
        glossary={glossary}
        onLookup={onLookup}
        ariaLabelForTerm={(term) => `${term} : explication`}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'situé : explication' }),
    ).toBeInTheDocument();
  });

  it('calls onLookup with the term when clicked', async () => {
    render(
      <GlossaryText
        text="La tour Eiffel est situé à Paris."
        glossary={glossary}
        onLookup={onLookup}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /situé/ }));

    expect(onLookup).toHaveBeenCalledWith('situé');
  });

  it('prefers the longest match when a term contains another', () => {
    render(
      <GlossaryText
        text="Elle est au bord de la Seine."
        glossary={glossary}
        onLookup={onLookup}
      />,
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveTextContent('au bord de');
  });

  it('preserves all surrounding text', () => {
    render(
      <GlossaryText
        text="Pendant quarante ans, elle est restée haute."
        glossary={glossary}
        onLookup={onLookup}
      />,
    );

    const termButton = screen.getByRole('button', { name: /Pendant/ });
    const container = termButton.parentElement;
    expect(container).toHaveTextContent('Pendant quarante ans, elle est restée haute.');
  });

  it('renders plain text with no buttons when disabled', () => {
    render(
      <GlossaryText
        text="La tour Eiffel est situé à Paris."
        glossary={glossary}
        onLookup={onLookup}
        enabled={false}
      />,
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('La tour Eiffel est situé à Paris.')).toBeInTheDocument();
  });

  it('highlights every occurrence of a marked term without changing the text', () => {
    const { container } = render(
      <GlossaryText
        text="Paris attire les visiteurs. Paris reste Paris."
        glossary={[]}
        onLookup={onLookup}
        markedTerms={['Paris']}
      />,
    );

    const highlights = container.querySelectorAll('.mark-highlight');
    expect(highlights).toHaveLength(3);
    highlights.forEach((highlight) => {
      expect(highlight).toHaveTextContent('Paris');
    });
    expect(container).toHaveTextContent(
      'Paris attire les visiteurs. Paris reste Paris.',
    );
  });

  it('does not highlight a marked term inside a longer word', () => {
    const { container } = render(
      <GlossaryText
        text="Une Parisienne arrive à Paris."
        glossary={[]}
        onLookup={onLookup}
        markedTerms={['Paris']}
      />,
    );

    const highlights = container.querySelectorAll('.mark-highlight');
    expect(highlights).toHaveLength(1);
    expect(highlights[0]).toHaveTextContent('Paris');
    expect(highlights[0]).not.toHaveTextContent('Parisienne');
  });

  it('keeps a marked glossary term inside its button without nesting buttons', () => {
    const { container } = render(
      <GlossaryText
        text="La tour Eiffel est situé à Paris."
        glossary={glossary}
        onLookup={onLookup}
        markedTerms={['situé']}
      />,
    );

    const termButton = screen.getByRole('button', { name: /situé/ });
    expect(termButton.querySelector('.mark-highlight')).toHaveTextContent(
      'situé',
    );
    expect(termButton.querySelector('button')).toBeNull();
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container).toHaveTextContent('La tour Eiffel est situé à Paris.');
  });

  it('keeps one glossary button when a mark covers only part of the term', () => {
    const { container } = render(
      <GlossaryText
        text="Elle est au bord de la Seine."
        glossary={[{ term: 'au bord de' }]}
        onLookup={onLookup}
        markedTerms={['bord']}
      />,
    );

    const termButton = screen.getByRole('button', { name: 'au bord de' });
    expect(termButton.querySelectorAll('.mark-highlight')).toHaveLength(1);
    expect(termButton.querySelector('.mark-highlight')).toHaveTextContent(
      'bord',
    );
    expect(termButton).toHaveTextContent('au bord de');
    expect(termButton.querySelector('button')).toBeNull();
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container).toHaveTextContent('Elle est au bord de la Seine.');
  });

  it('keeps marks highlighted while glossary lookup is disabled', () => {
    const { container } = render(
      <GlossaryText
        text="La tour Eiffel est situé à Paris."
        glossary={glossary}
        onLookup={onLookup}
        enabled={false}
        markedTerms={['Paris']}
      />,
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.mark-highlight')).toHaveLength(1);
    expect(container).toHaveTextContent('La tour Eiffel est situé à Paris.');
  });
});
