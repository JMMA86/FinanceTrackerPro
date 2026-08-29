/**
 * AuthClient Component Tests
 *
 * AuthClient is the auth container that wires login/register server actions,
 * mode switching and router redirects. Children are mocked to keep focus on
 * AuthClient's own logic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { SyntheticEvent } from 'react';
import AuthClient from '../AuthClient';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/es/auth',
}));

const mockLoginAction = vi.fn();
const mockRegisterAction = vi.fn();

vi.mock('@/actions/auth.actions', () => ({
  loginAction: (...args: unknown[]) => mockLoginAction(...args),
  registerAction: (...args: unknown[]) => mockRegisterAction(...args),
}));

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const keyMap: Record<string, string> = {
      'login.subtitleDesktop': 'Bienvenido de nuevo',
      'login.subtitleDescDesktop': 'Ingresa a tu panel',
      'login.email': 'Email',
      'login.emailPlaceholder': 'tucorreo@ejemplo.com',
      'login.password': 'Contraseña',
      'login.passwordPlaceholder': '••••••••',
      'login.submit': 'Iniciar sesión',
      'login.submitting': 'Iniciando sesión...',
      'login.successMessage': '¡Sesión iniciada!',
      'register.title': 'Crear cuenta',
      'register.subtitleDesktop': 'Crea tu cuenta gratis',
      'register.name': 'Nombre',
      'register.namePlaceholder': 'Tu nombre',
      'register.email': 'Email',
      'register.emailPlaceholder': 'tu@email.com',
      'register.password': 'Contraseña',
      'register.passwordPlaceholder': '••••••••',
      'register.passwordRequirements': 'Requisitos',
      'register.passwordMinLength': 'Mínimo 12 caracteres',
      'register.passwordUppercase': 'Una mayúscula',
      'register.passwordLowercase': 'Una minúscula',
      'register.passwordNumber': 'Un número',
      'register.submit': 'Registrarse',
      'register.submitting': 'Registrando...',
      'errors.loginError': 'Error al iniciar sesión',
      'errors.registerError': 'Error al registrarse',
      'errors.invalidCredentials': 'Credenciales inválidas',
      'errors.rateLimitError': 'Demasiados intentos. Intenta más tarde.',
      'errors.validationError': 'Revisa los datos del formulario',
    };
    return keyMap[key] ?? key;
  }),
}));

vi.mock('../AnimatedBackground', () => ({
  AnimatedBackground: ({ minimal }: { minimal?: boolean }) => (
    <div data-testid="animated-bg" data-minimal={minimal ? 'true' : 'false'} />
  ),
}));

type MobileAuthFormMockProps = {
  mode: 'login' | 'register';
  loading: boolean;
  error: string;
  success: string;
  onLoginSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
  onRegisterSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
  onSwitchMode: (mode: 'login' | 'register') => void;
};

vi.mock('../MobileAuthForm', () => ({
  default: ({ mode, onLoginSubmit, onRegisterSubmit, onSwitchMode }: MobileAuthFormMockProps) => (
    <div>
      <form
        data-testid="mobile-form"
        onSubmit={mode === 'login' ? onLoginSubmit : onRegisterSubmit}
      >
        <button type="submit">Mobile Submit</button>
      </form>
      <button
        type="button"
        data-testid="mobile-switch"
        onClick={() => onSwitchMode(mode === 'login' ? 'register' : 'login')}
      >
        Mobile Switch
      </button>
    </div>
  ),
}));

type DesktopAuthPanelMockProps = {
  mode: 'login' | 'register';
  onSwitchMode: (mode: 'login' | 'register') => void;
};

vi.mock('../DesktopAuthPanel', () => ({
  default: ({ mode, onSwitchMode }: DesktopAuthPanelMockProps) => (
    <div>
      <span data-testid="desktop-mode">{mode}</span>
      <button
        type="button"
        data-testid="desktop-switch"
        onClick={() => onSwitchMode(mode === 'login' ? 'register' : 'login')}
      >
        Desktop Switch
      </button>
    </div>
  ),
}));

type RegisterFormMockProps = {
  loading: boolean;
  error: string;
  formData: { name: string; email: string; password: string };
  isFormValid: boolean;
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
  onFieldChange: (field: string, value: string) => void;
};

vi.mock('../RegisterForm', () => ({
  default: ({ error, isFormValid, onSubmit, onFieldChange }: RegisterFormMockProps) => (
    <form data-testid="register-form" onSubmit={onSubmit}>
      {error && <div data-testid="register-error">{error}</div>}
      <input
        data-testid="reg-name"
        aria-label="reg-name"
        onChange={(e) => onFieldChange('name', e.target.value)}
      />
      <input
        data-testid="reg-email"
        aria-label="reg-email"
        onChange={(e) => onFieldChange('email', e.target.value)}
      />
      <input
        data-testid="reg-password"
        aria-label="reg-password"
        onChange={(e) => onFieldChange('password', e.target.value)}
      />
      <span data-testid="register-valid">{isFormValid ? 'valid' : 'invalid'}</span>
      <button type="submit">Register Submit</button>
    </form>
  ),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuthClient', () => {
  const authDict = {};

  const renderAuth = (props: Partial<React.ComponentProps<typeof AuthClient>> = {}) =>
    render(
      <AuthClient
        lang="es"
        auth={authDict}
        common={{}}
        initialMode="login"
        isRegistered={false}
        {...props}
      />
    );

  beforeEach(() => {
    vi.clearAllMocks();
    mockLoginAction.mockResolvedValue({ success: true, data: { id: 'u1', email: 'a@b.co' } });
    mockRegisterAction.mockResolvedValue({
      success: true,
      data: { id: 'u1', email: 'a@b.co', name: 'Ana' },
    });
  });

  it('should render in login mode by default', () => {
    renderAuth();

    expect(screen.getByTestId('desktop-mode')).toHaveTextContent('login');
    expect(screen.getByPlaceholderText('tucorreo@ejemplo.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
    expect(screen.getByText('Bienvenido de nuevo')).toBeInTheDocument();
  });

  it('should switch between login and register modes', () => {
    renderAuth();

    fireEvent.click(screen.getByTestId('desktop-switch'));
    expect(screen.getByTestId('desktop-mode')).toHaveTextContent('register');

    fireEvent.click(screen.getByTestId('desktop-switch'));
    expect(screen.getByTestId('desktop-mode')).toHaveTextContent('login');
  });

  it('should call loginAction and redirect to the dashboard on success', async () => {
    renderAuth();

    fireEvent.change(screen.getByPlaceholderText('tucorreo@ejemplo.com'), {
      target: { value: 'ana@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'Password12345' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    await waitFor(() => {
      expect(mockLoginAction).toHaveBeenCalledWith({
        email: 'ana@example.com',
        password: 'Password12345',
      });
    });
    expect(mockPush).toHaveBeenCalledWith('/es/dashboard');
  });

  it('should use redirectPath when provided', async () => {
    renderAuth({ redirectPath: '/custom/dashboard' });

    fireEvent.change(screen.getByPlaceholderText('tucorreo@ejemplo.com'), {
      target: { value: 'ana@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'Password12345' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/custom/dashboard');
    });
  });

  it('should show the login error message on failed login', async () => {
    mockLoginAction.mockResolvedValue({
      success: false,
      error: 'Invalid credentials',
      code: 'AUTH_ERROR',
    });

    renderAuth();

    fireEvent.change(screen.getByPlaceholderText('tucorreo@ejemplo.com'), {
      target: { value: 'ana@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'wrong' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    await waitFor(() => {
      expect(screen.getByText('Credenciales inválidas')).toBeInTheDocument();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('should register a new user and switch to login with a success message', async () => {
    renderAuth();

    fireEvent.click(screen.getByTestId('desktop-switch'));
    expect(screen.getByTestId('desktop-mode')).toHaveTextContent('register');

    fireEvent.change(screen.getByTestId('reg-name'), { target: { value: 'Ana Torres' } });
    fireEvent.change(screen.getByTestId('reg-email'), { target: { value: 'ana@example.com' } });
    fireEvent.change(screen.getByTestId('reg-password'), { target: { value: 'Password12345' } });

    fireEvent.click(screen.getByRole('button', { name: 'Register Submit' }));

    await waitFor(() => {
      expect(mockRegisterAction).toHaveBeenCalledWith({
        name: 'Ana Torres',
        email: 'ana@example.com',
        password: 'Password12345',
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('desktop-mode')).toHaveTextContent('login');
    });
    expect(screen.getByText('¡Sesión iniciada!')).toBeInTheDocument();
  });

  it('should show the register error message on failed registration', async () => {
    mockRegisterAction.mockResolvedValue({
      success: false,
      error: 'Registration failed',
      code: 'AUTH_ERROR',
    });

    renderAuth();

    fireEvent.click(screen.getByTestId('desktop-switch'));

    fireEvent.change(screen.getByTestId('reg-name'), { target: { value: 'Ana Torres' } });
    fireEvent.change(screen.getByTestId('reg-email'), { target: { value: 'ana@example.com' } });
    fireEvent.change(screen.getByTestId('reg-password'), { target: { value: 'Password12345' } });

    fireEvent.click(screen.getByRole('button', { name: 'Register Submit' }));

    await waitFor(() => {
      expect(screen.getByTestId('register-error')).toHaveTextContent('Error al registrarse');
    });
  });

  it('should validate register fields and mark the form invalid until all requirements pass', async () => {
    renderAuth();

    fireEvent.click(screen.getByTestId('desktop-switch'));

    expect(screen.getByTestId('register-valid')).toHaveTextContent('invalid');

    fireEvent.change(screen.getByTestId('reg-name'), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByTestId('reg-email'), { target: { value: 'ana@example.com' } });
    fireEvent.change(screen.getByTestId('reg-password'), { target: { value: 'short' } });

    expect(screen.getByTestId('register-valid')).toHaveTextContent('invalid');

    fireEvent.change(screen.getByTestId('reg-password'), { target: { value: 'Password12345' } });

    expect(screen.getByTestId('register-valid')).toHaveTextContent('valid');
  });

  it('should submit via the mobile form using the current mode handler', async () => {
    renderAuth();

    const mobileForm = screen.getByTestId('mobile-form');
    fireEvent.submit(mobileForm);

    await waitFor(() => {
      expect(mockLoginAction).toHaveBeenCalled();
    });
  });

  it('should switch mode from the mobile toggle', () => {
    renderAuth();

    fireEvent.click(screen.getByTestId('mobile-switch'));
    expect(screen.getByTestId('desktop-mode')).toHaveTextContent('register');
  });

  it('should show the success message when isRegistered is true', () => {
    renderAuth({ isRegistered: true });

    expect(screen.getByText('¡Sesión iniciada!')).toBeInTheDocument();
  });

  it('should sanitize an external redirect URL to the dashboard on login success', async () => {
    renderAuth({ redirectPath: 'https://evil.com' });

    fireEvent.change(screen.getByPlaceholderText('tucorreo@ejemplo.com'), {
      target: { value: 'ana@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'Password12345' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    await waitFor(() => {
      expect(mockLoginAction).toHaveBeenCalled();
    });
    expect(mockPush).toHaveBeenCalledWith('/es/dashboard');
    expect(mockPush).not.toHaveBeenCalledWith('https://evil.com');
  });

  it('should sanitize a protocol-relative redirect URL to the dashboard on login success', async () => {
    renderAuth({ redirectPath: '//evil.com' });

    fireEvent.change(screen.getByPlaceholderText('tucorreo@ejemplo.com'), {
      target: { value: 'ana@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'Password12345' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/es/dashboard');
    });
    expect(mockPush).not.toHaveBeenCalledWith('//evil.com');
  });
});
