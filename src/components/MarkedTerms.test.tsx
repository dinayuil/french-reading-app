import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MarkedTerms from './MarkedTerms';

describe('MarkedTerms', () => {
  it('lists marked terms and removes one from its chip', async () => {
    const onRemove = vi.fn();
    render(<MarkedTerms terms={['Paris', 'au bord de']} onRemove={onRemove} />);

    const region = screen.getByRole('region', { name: 'Mots marqués' });
    expect(within(region).getByText('Paris')).toBeInTheDocument();
    expect(within(region).getByText('au bord de')).toBeInTheDocument();

    await userEvent.click(
      within(region).getByRole('button', {
        name: 'Retirer la marque de « Paris »',
      }),
    );

    expect(onRemove).toHaveBeenCalledWith('Paris');
  });

  it('renders nothing when no term is marked', () => {
    const { container } = render(<MarkedTerms terms={[]} onRemove={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('keeps extra actions and notices with the marked terms', () => {
    render(
      <MarkedTerms
        terms={['Paris']}
        onRemove={vi.fn()}
        extraAction={(term) => (
          <button type="button">Ajouter {term} au carnet</button>
        )}
        footer={<p role="status">Ajouté au carnet.</p>}
      />,
    );

    const region = screen.getByRole('region', { name: 'Mots marqués' });
    expect(
      within(region).getByRole('button', {
        name: 'Ajouter Paris au carnet',
      }),
    ).toBeInTheDocument();
    expect(within(region).getByRole('status')).toHaveTextContent(
      'Ajouté au carnet.',
    );
  });
});
