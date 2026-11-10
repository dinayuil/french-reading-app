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
});
