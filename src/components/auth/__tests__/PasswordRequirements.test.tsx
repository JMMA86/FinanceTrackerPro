/**
 * PasswordRequirements Component Tests
 * Covers the 4 password rules (min-length, uppercase, lowercase, number) as
 * fulfilled/unfulfilled against representative passwords.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PasswordRequirements from '../PasswordRequirements';

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const keyMap: Record<string, string> = {
      'register.passwordRequirements': 'Requisitos',
      'register.passwordMinLength': 'Mínimo 12 caracteres',
      'register.passwordUppercase': 'Una mayúscula',
      'register.passwordLowercase': 'Una minúscula',
      'register.passwordNumber': 'Un número',
    };
    return keyMap[key] ?? key;
  }),
}));

describe('PasswordRequirements', () => {
  // PASSWORD_RULES order: min-length, uppercase, lowercase, number
  const renderWithPassword = (password: string) =>
    render(<PasswordRequirements password={password} auth={{}} />);

  const getRuleItems = () => screen.getAllByRole('listitem');

  it('renders the requirements heading', () => {
    renderWithPassword('Password12345');
    expect(screen.getByText('Requisitos')).toBeInTheDocument();
  });

  it('marks all four requirements as unfulfilled for an empty password', () => {
    renderWithPassword('');
    const items = getRuleItems();
    expect(items[0].textContent).toContain('○');
    expect(items[1].textContent).toContain('○');
    expect(items[2].textContent).toContain('○');
    expect(items[3].textContent).toContain('○');
  });

  it('only fulfills the lowercase rule for a short lowercase-only password', () => {
    renderWithPassword('abc');
    const items = getRuleItems();
    expect(items[0].textContent).toContain('○'); // min-length
    expect(items[1].textContent).toContain('○'); // uppercase
    expect(items[2].textContent).toContain('✓'); // lowercase
    expect(items[3].textContent).toContain('○'); // number
  });

  it('only fulfills uppercase for a password without lowercase or number', () => {
    renderWithPassword('ABCDEFGHIJKL');
    const items = getRuleItems();
    expect(items[0].textContent).toContain('✓'); // min-length
    expect(items[1].textContent).toContain('✓'); // uppercase
    expect(items[2].textContent).toContain('○'); // lowercase
    expect(items[3].textContent).toContain('○'); // number
  });

  it('fulfills min-length, lowercase and number but not uppercase', () => {
    renderWithPassword('abcdefghijk1');
    const items = getRuleItems();
    expect(items[0].textContent).toContain('✓'); // min-length
    expect(items[1].textContent).toContain('○'); // uppercase
    expect(items[2].textContent).toContain('✓'); // lowercase
    expect(items[3].textContent).toContain('✓'); // number
  });

  it('fulfills all four requirements for a compliant password', () => {
    renderWithPassword('Password12345');
    const items = getRuleItems();
    for (const item of items) {
      expect(item.textContent).toContain('✓');
    }
  });

  it('applies fulfilled styling to met rules', () => {
    renderWithPassword('Password12345');
    const items = getRuleItems();
    expect(items[0].className).toContain('flex');
    const check = items[0].querySelector('span');
    expect(check?.className).toContain('text-green-400');
  });
});
