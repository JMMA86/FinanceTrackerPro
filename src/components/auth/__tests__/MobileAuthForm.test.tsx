/**
 * MobileAuthForm Component Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MobileAuthForm from '../MobileAuthForm';

// Children are mocked to keep focus on MobileAuthForm's own branches.
vi.mock('../MobileFormInputs', () => ({
  default: () => <div data-testid="mobile-inputs" />,
}));

vi.mock('../PasswordRequirements', () => ({
  default: () => <div data-testid="password-req" />,
}));

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const keyMap: Record<string, string> = {
      'login.title': 'Iniciar sesión',
      'login.subtitleDescDesktop': 'Ingresa a tu panel',
      'login.submit': 'Iniciar sesión',
      'login.submitting': 'Iniciando sesión...',
      'login.newUser': '¿No tienes cuenta?',
      'register.title': 'Crear cuenta',
      'register.subtitleDesktop': 'Crea tu cuenta gratis',
      'register.submit': 'Registrarse',
      'register.submitting': 'Registrando...',
      'register.hasAccount': '¿Ya tienes cuenta?',
    };
    return keyMap[key] ?? key;
  }),
}));

describe('MobileAuthForm', () => {
  const mockOnLoginSubmit = vi.fn((e: React.SyntheticEvent) => e.preventDefault());
  const mockOnRegisterSubmit = vi.fn((e: React.SyntheticEvent) => e.preventDefault());
  const mockOnSwitchMode = vi.fn();

  const baseProps = {
    mode: 'login' as 'login' | 'register',
    loading: false,
    error: '',
    success: '',
    loginData: { email: '', password: '' },
    registerData: { name: '', email: '', password: '' },
    isRegisterValid: false,
    auth: {},
    onLoginSubmit: mockOnLoginSubmit,
    onRegisterSubmit: mockOnRegisterSubmit,
    onLoginDataChange: vi.fn(),
    onRegisterDataChange: vi.fn(),
    onSwitchMode: mockOnSwitchMode,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderForm = (overrides: Partial<typeof baseProps> = {}) =>
    render(<MobileAuthForm {...baseProps} {...overrides} />);

  it('should render the login title when mode is login', () => {
    const { container } = renderForm();
    expect(container.querySelectorAll('h1')[0]?.textContent).toContain('Iniciar sesión');
  });

  it('should render the register title when mode is register', () => {
    const { container } = renderForm({ mode: 'register' });
    expect(container.querySelectorAll('h1')[1]?.textContent).toContain('Crear cuenta');
  });

  it('should submit via onLoginSubmit in login mode', () => {
    renderForm();
    const form = document.querySelector('form')!;
    fireEvent.submit(form);
    expect(mockOnLoginSubmit).toHaveBeenCalled();
  });

  it('should submit via onRegisterSubmit in register mode', () => {
    renderForm({ mode: 'register' });
    const form = document.querySelector('form')!;
    fireEvent.submit(form);
    expect(mockOnRegisterSubmit).toHaveBeenCalled();
  });

  it('should show the success message', () => {
    renderForm({ success: '¡Cuenta creada!' });
    expect(screen.getByText('¡Cuenta creada!')).toBeInTheDocument();
  });

  it('should show the error message', () => {
    renderForm({ error: 'Credenciales inválidas' });
    expect(screen.getByText('Credenciales inválidas')).toBeInTheDocument();
  });

  it('should call onSwitchMode when the toggle is clicked', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: /¿No tienes cuenta\?/ }));
    expect(mockOnSwitchMode).toHaveBeenCalledWith('register');
  });

  it('should call onSwitchMode with login when in register mode', () => {
    renderForm({ mode: 'register' });
    fireEvent.click(screen.getByRole('button', { name: /¿Ya tienes cuenta\?/ }));
    expect(mockOnSwitchMode).toHaveBeenCalledWith('login');
  });

  it('should disable the submit button while loading', () => {
    renderForm({ loading: true });
    const submit = document.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submit).toBeDisabled();
  });

  it('should disable the submit button in register mode when the form is invalid', () => {
    renderForm({ mode: 'register', isRegisterValid: false });
    const submit = document.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submit).toBeDisabled();
  });

  it('should render the password requirements in register mode when a password is typed', () => {
    renderForm({
      mode: 'register',
      registerData: { name: 'Ana', email: 'a@b.co', password: 'x' },
    });
    expect(screen.getByTestId('password-req')).toBeInTheDocument();
  });
});
