import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  afterEach(() => {
    vi.unstubAllGlobals();
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

  it('selects the whole highlighted occurrence when a marked word is clicked', async () => {
    const onSelectMarked = vi.fn();
    const { container } = render(
      <GlossaryText
        text="Paris attire les visiteurs. Paris reste Paris."
        glossary={[]}
        onLookup={onLookup}
        markedTerms={['Paris']}
        onSelectMarked={onSelectMarked}
      />,
    );

    const highlight = container.querySelector<HTMLElement>('.mark-highlight');
    expect(highlight).toHaveAttribute('role', 'button');

    await userEvent.click(highlight!);

    expect(onSelectMarked).toHaveBeenCalledTimes(1);
    const [term, range] = onSelectMarked.mock.calls[0] as [string, Range];
    expect(term).toBe('Paris');
    expect(range.toString()).toBe('Paris');
  });

  it('selects the actual occurrence when the same phrase overlaps itself', async () => {
    const onSelectMarked = vi.fn();
    const { container } = render(
      <GlossaryText
        text="Très très très bien."
        glossary={[]}
        onLookup={onLookup}
        markedTerms={['très très']}
        onSelectMarked={onSelectMarked}
      />,
    );

    const highlights = container.querySelectorAll<HTMLElement>(
      '.mark-highlight',
    );
    expect(highlights).toHaveLength(3);

    await userEvent.click(highlights[0]);
    let [term, range] = onSelectMarked.mock.calls[0] as [string, Range];
    expect(term).toBe('Très très');
    expect(term.toLowerCase()).toBe('très très');
    expect(range.toString()).toBe(term);

    onSelectMarked.mockClear();
    await userEvent.click(highlights[2]);
    [term, range] = onSelectMarked.mock.calls[0] as [string, Range];
    expect(term).toBe('très très');
    expect(range.toString()).toBe(term);
  });

  it('selects a marked phrase split by glossary markup without opening the glossary', async () => {
    const onSelectMarked = vi.fn();
    const { container } = render(
      <GlossaryText
        text="Elle est au bord de la Seine."
        glossary={[{ term: 'au bord de' }]}
        onLookup={onLookup}
        markedTerms={['est au bord de la']}
        onSelectMarked={onSelectMarked}
      />,
    );

    const termButton = screen.getByRole('button', { name: 'au bord de' });
    const markedPart =
      termButton.querySelector<HTMLElement>('.mark-highlight');
    expect(markedPart).not.toBeNull();
    expect(markedPart).not.toHaveAttribute('role');

    await userEvent.click(markedPart!);

    expect(onLookup).not.toHaveBeenCalled();
    expect(onSelectMarked).toHaveBeenCalledTimes(1);
    const [term, range] = onSelectMarked.mock.calls[0] as [string, Range];
    expect(term).toBe('est au bord de la');
    expect(range.toString()).toBe('est au bord de la');
    expect(termButton.querySelector('button')).toBeNull();
    expect(container.querySelectorAll('button')).toHaveLength(1);
  });

  it('keeps glossary lookup for an unmarked term while highlights are selectable', async () => {
    const onSelectMarked = vi.fn();
    render(
      <GlossaryText
        text="La tour Eiffel est situé à Paris."
        glossary={glossary}
        onLookup={onLookup}
        markedTerms={['Paris']}
        onSelectMarked={onSelectMarked}
        ariaLabelForTerm={(term) => `${term} : explication`}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'situé : explication' }),
    );

    expect(onLookup).toHaveBeenCalledWith('situé');
    expect(onSelectMarked).not.toHaveBeenCalled();
  });

  it('selects a highlighted word with Enter or Space', async () => {
    const onSelectMarked = vi.fn();
    const { container } = render(
      <GlossaryText
        text="Paris attire les visiteurs."
        glossary={[]}
        onLookup={onLookup}
        markedTerms={['Paris']}
        onSelectMarked={onSelectMarked}
      />,
    );

    const highlight = container.querySelector<HTMLElement>('.mark-highlight');
    highlight!.focus();

    await userEvent.keyboard('{Enter}');
    expect(onSelectMarked).toHaveBeenCalledTimes(1);

    onSelectMarked.mockClear();
    await userEvent.keyboard(' ');
    expect(onSelectMarked).toHaveBeenCalledTimes(1);
  });

  it('still selects a highlighted word by keyboard while other text is selected', async () => {
    const onSelectMarked = vi.fn();
    vi.stubGlobal(
      'getSelection',
      vi.fn(() => ({
        isCollapsed: false,
        toString: () => 'Un autre passage',
      })),
    );

    const { container } = render(
      <GlossaryText
        text="Paris attire les visiteurs."
        glossary={[]}
        onLookup={onLookup}
        markedTerms={['Paris']}
        onSelectMarked={onSelectMarked}
      />,
    );

    container.querySelector<HTMLElement>('.mark-highlight')!.focus();
    await userEvent.keyboard('{Enter}');

    expect(onSelectMarked).toHaveBeenCalledTimes(1);
  });

  it('selects a fully marked glossary term with the keyboard instead of looking it up', async () => {
    const onSelectMarked = vi.fn();
    render(
      <GlossaryText
        text="La tour Eiffel est situé à Paris."
        glossary={glossary}
        onLookup={onLookup}
        markedTerms={['situé']}
        onSelectMarked={onSelectMarked}
      />,
    );

    const termButton = screen.getByRole('button', { name: 'situé' });
    termButton.focus();
    await userEvent.keyboard('{Enter}');

    expect(onSelectMarked).toHaveBeenCalledTimes(1);
    expect(onLookup).not.toHaveBeenCalled();
  });

  it('selects a partially marked glossary fragment with the keyboard', async () => {
    const onSelectMarked = vi.fn();
    render(
      <GlossaryText
        text="Elle est au bord de la Seine."
        glossary={[{ term: 'au bord de' }]}
        onLookup={onLookup}
        markedTerms={['bord']}
        onSelectMarked={onSelectMarked}
      />,
    );

    const termButton = screen.getByRole('button', { name: 'au bord de' });
    termButton.focus();
    await userEvent.keyboard('{Enter}');

    expect(onSelectMarked).toHaveBeenCalledTimes(1);
    const [term, range] = onSelectMarked.mock.calls[0] as [string, Range];
    expect(term).toBe('bord');
    expect(range.toString()).toBe('bord');
    expect(onLookup).not.toHaveBeenCalled();
  });

  it('keeps a manual drag selection instead of replacing it', async () => {
    const onSelectMarked = vi.fn();
    vi.stubGlobal(
      'getSelection',
      vi.fn(() => ({
        isCollapsed: false,
        toString: () => 'Paris attire',
      })),
    );

    const { container } = render(
      <GlossaryText
        text="Paris attire les visiteurs."
        glossary={[]}
        onLookup={onLookup}
        markedTerms={['Paris']}
        onSelectMarked={onSelectMarked}
      />,
    );

    await userEvent.click(
      container.querySelector<HTMLElement>('.mark-highlight')!,
    );

    expect(onSelectMarked).not.toHaveBeenCalled();
  });
});
