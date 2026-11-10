import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LanguageSwitch from './LanguageSwitch';
import { i18n } from '../i18n';

describe('LanguageSwitch', () => {
  it('shows both languages with French selected by default', () => {
    render(<LanguageSwitch />);

    expect(
      screen.getByRole('group', { name: "Langue de l'interface" }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'FR' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: '中文' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('switches to Chinese, updates aria-pressed and persists the choice', async () => {
    render(<LanguageSwitch />);

    await userEvent.click(screen.getByRole('button', { name: '中文' }));

    expect(i18n.language).toBe('zh');
    expect(screen.getByRole('button', { name: '中文' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'FR' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(
      screen.getByRole('group', { name: '界面语言' }),
    ).toBeInTheDocument();
    expect(
      JSON.parse(localStorage.getItem('frp:settings') ?? '{}'),
    ).toMatchObject({ uiLanguage: 'zh' });
  });
});
