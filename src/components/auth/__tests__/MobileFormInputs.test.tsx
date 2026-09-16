/**
 * MobileFormInputs Component Tests
 * Covers the morphing login/register fields: name field visibility, field
 * values, minLength on register password, callback routing per mode and the
 * disabled state while loading.
 *
 * NOTE: MobileFormInputs uses bare <label> elements (no htmlFor), so inputs
 * are queried via their placeholders.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MobileFormInputs from '../MobileFormInputs';

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const keyMap: Record<string, string> = {
      'register.name': 'Nombre',
      'register.namePlaceholder': 'Tu nombre',
      'login.email': 'Email',
      'login.emailPlaceholder': 'tu@email.com',
      'login.password': 'Contraseña',
      'login.passwordPlaceholder': '••••••••',
    };
    return keyMap[key] ?? key;
  }),
}));

const baseProps = {
  mode: 'login' as 'login' | 'register',
  loading: false,
  loginData: { email: 'login@example.com', password: 'login-pass' },
  registerData: { name: 'Ana', email: 'reg@example.com', password: 'reg-pass' },
  auth: {},
  onLoginDataChange: vi.fn(),
  onRegisterDataChange: vi.fn(),
};

describe('MobileFormInputs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderInputs = (overrides: Partial<typeof baseProps> = {}) =>
    render(<MobileFormInputs {...baseProps} {...overrides} />);

  const nameInput = () => screen.getByPlaceholderText('Tu nombre') as HTMLInputElement;
  const emailInput = () => screen.getByPlaceholderText('tu@email.com') as HTMLInputElement;
  const passwordInput = () => screen.getByPlaceholderText('••••••••') as HTMLInputElement;

  describe('login mode', () => {
    it('shows email and password, and collapses the name field', () => {
      renderInputs();

      const nameContainer = nameInput().closest('div') as HTMLElement;
      expect(nameContainer.style.maxHeight).toBe('0px');
      expect(nameContainer.style.opacity).toBe('0');

      expect(emailInput()).toBeInTheDocument();
      expect(passwordInput()).toBeInTheDocument();
    });

    it('does not mark the name field as required in login mode', () => {
      renderInputs();
      expect(nameInput()).not.toHaveAttribute('required');
    });

    it('uses login data values', () => {
      renderInputs();
      expect(emailInput()).toHaveValue('login@example.com');
      expect(passwordInput()).toHaveValue('login-pass');
    });

    it('does not apply the min-length attribute to the password in login mode', () => {
      renderInputs();
      expect(passwordInput()).not.toHaveAttribute('minlength');
    });

    it('routes email changes through onLoginDataChange', () => {
      const onLoginDataChange = vi.fn();
      renderInputs({ onLoginDataChange });

      fireEvent.change(emailInput(), { target: { value: 'new@example.com' } });
      expect(onLoginDataChange).toHaveBeenCalledWith({
        email: 'new@example.com',
        password: 'login-pass',
      });
    });

    it('routes password changes through onLoginDataChange', () => {
      const onLoginDataChange = vi.fn();
      renderInputs({ onLoginDataChange });

      fireEvent.change(passwordInput(), { target: { value: 'new-pass' } });
      expect(onLoginDataChange).toHaveBeenCalledWith({
        email: 'login@example.com',
        password: 'new-pass',
      });
    });
  });

  describe('register mode', () => {
    it('expands the name field', () => {
      renderInputs({ mode: 'register' });

      const nameContainer = nameInput().closest('div') as HTMLElement;
      expect(nameContainer.style.maxHeight).toBe('100px');
      expect(nameContainer.style.opacity).toBe('1');
    });

    it('marks the name field as required in register mode', () => {
      renderInputs({ mode: 'register' });
      expect(nameInput()).toHaveAttribute('required');
    });

    it('applies minLength 12 to the password in register mode', () => {
      renderInputs({ mode: 'register' });
      expect(passwordInput().minLength).toBe(12);
    });

    it('uses register data values', () => {
      renderInputs({ mode: 'register' });
      expect(nameInput()).toHaveValue('Ana');
      expect(emailInput()).toHaveValue('reg@example.com');
      expect(passwordInput()).toHaveValue('reg-pass');
    });

    it('routes name changes through onRegisterDataChange', () => {
      const onRegisterDataChange = vi.fn();
      renderInputs({ mode: 'register', onRegisterDataChange });

      fireEvent.change(nameInput(), { target: { value: 'Ana María' } });
      expect(onRegisterDataChange).toHaveBeenCalledWith({
        name: 'Ana María',
        email: 'reg@example.com',
        password: 'reg-pass',
      });
    });

    it('routes email changes through onRegisterDataChange', () => {
      const onRegisterDataChange = vi.fn();
      renderInputs({ mode: 'register', onRegisterDataChange });

      fireEvent.change(emailInput(), { target: { value: 'new@example.com' } });
      expect(onRegisterDataChange).toHaveBeenCalledWith({
        name: 'Ana',
        email: 'new@example.com',
        password: 'reg-pass',
      });
    });
  });

  describe('loading state', () => {
    it('disables all inputs while loading', () => {
      renderInputs({ loading: true });

      expect(nameInput()).toBeDisabled();
      expect(emailInput()).toBeDisabled();
      expect(passwordInput()).toBeDisabled();
    });
  });
});
