/**
 * DesktopAuthPanel Component Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DesktopAuthPanel from '../DesktopAuthPanel';

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const keyMap: Record<string, string> = {
      'register.newUserTitle': '¿Nuevo aquí?',
      'register.newUserDescription': 'Crea tu cuenta en un minuto',
      'register.newUserButton': 'Crear cuenta',
      'register.inviteTitle': '¿Ya tienes cuenta?',
      'register.inviteDescription': 'Inicia sesión para continuar',
      'register.inviteButton': 'Iniciar sesión',
    };
    return keyMap[key] ?? key;
  }),
}));

describe('DesktopAuthPanel', () => {
  const mockOnSwitchMode = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show the new-user content when mode is login', () => {
    render(<DesktopAuthPanel mode="login" auth={{}} onSwitchMode={mockOnSwitchMode} />);

    expect(screen.getByText('¿Nuevo aquí?')).toBeInTheDocument();
    expect(screen.getByText('Crea tu cuenta en un minuto')).toBeInTheDocument();
    expect(screen.getByText('Crear cuenta')).toBeInTheDocument();
  });

  it('should show the invite content when mode is register', () => {
    render(<DesktopAuthPanel mode="register" auth={{}} onSwitchMode={mockOnSwitchMode} />);

    expect(screen.getByText('¿Ya tienes cuenta?')).toBeInTheDocument();
    expect(screen.getByText('Inicia sesión para continuar')).toBeInTheDocument();
    expect(screen.getByText('Iniciar sesión')).toBeInTheDocument();
  });

  it('should call onSwitchMode with register when in login mode', () => {
    render(<DesktopAuthPanel mode="login" auth={{}} onSwitchMode={mockOnSwitchMode} />);

    fireEvent.click(screen.getByText('Crear cuenta'));
    expect(mockOnSwitchMode).toHaveBeenCalledWith('register');
  });

  it('should call onSwitchMode with login when in register mode', () => {
    render(<DesktopAuthPanel mode="register" auth={{}} onSwitchMode={mockOnSwitchMode} />);

    fireEvent.click(screen.getByText('Iniciar sesión'));
    expect(mockOnSwitchMode).toHaveBeenCalledWith('login');
  });
});
