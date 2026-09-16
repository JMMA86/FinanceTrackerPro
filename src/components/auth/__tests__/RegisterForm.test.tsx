/**
 * RegisterForm Component Tests
 * Covers the shared register form used in both mobile and desktop layouts:
 * suffix ids, password requirements checklist, error rendering, submit state
 * and field-change callbacks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RegisterForm from '../RegisterForm';

const labels = {
  name: 'Nombre',
  namePlaceholder: 'Tu nombre',
  email: 'Email',
  emailPlaceholder: 'tu@email.com',
  password: 'Contraseña',
  passwordPlaceholder: '••••••••',
  passwordRequirements: 'Requisitos',
  passwordMinLength: 'Mínimo 12 caracteres',
  passwordUppercase: 'Una mayúscula',
  passwordLowercase: 'Una minúscula',
  passwordNumber: 'Un número',
  submit: 'Registrarse',
  submitting: 'Registrando...',
};

const baseProps = {
  loading: false,
  error: '',
  formData: { name: '', email: '', password: '' },
  isFormValid: false,
  isMobile: false,
  onSubmit: vi.fn((e: React.SyntheticEvent) => e.preventDefault()),
  onFieldChange: vi.fn(),
  labels,
};

describe('RegisterForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderForm = (overrides: Partial<typeof baseProps> = {}) =>
    render(<RegisterForm {...baseProps} {...overrides} />);

  describe('render desktop vs mobile', () => {
    it('uses the -desktop suffix for input ids by default', () => {
      const { container } = renderForm();
      expect(container.querySelector('#name-desktop')).toBeInTheDocument();
      expect(container.querySelector('#email-desktop')).toBeInTheDocument();
      expect(container.querySelector('#password-desktop')).toBeInTheDocument();
    });

    it('uses the -mobile suffix when isMobile is true', () => {
      const { container } = renderForm({ isMobile: true });
      expect(container.querySelector('#name-mobile')).toBeInTheDocument();
      expect(container.querySelector('#email-mobile')).toBeInTheDocument();
      expect(container.querySelector('#password-mobile')).toBeInTheDocument();
    });
  });

  describe('password requirements checklist', () => {
    it('does not render the checklist when the password is empty', () => {
      renderForm();
      expect(screen.queryByText('Requisitos')).not.toBeInTheDocument();
    });

    it('marks only the lowercase requirement as met for a partial password', () => {
      renderForm({ formData: { name: 'Ana', email: 'a@b.co', password: 'abc' } });

      expect(screen.getByText('Requisitos')).toBeInTheDocument();

      const minLengthItem = screen.getByText('Mínimo 12 caracteres').closest('li')!;
      const uppercaseItem = screen.getByText('Una mayúscula').closest('li')!;
      const lowercaseItem = screen.getByText('Una minúscula').closest('li')!;
      const numberItem = screen.getByText('Un número').closest('li')!;

      expect(minLengthItem.querySelector('svg')!.getAttribute('class')).toContain('text-gray-400');
      expect(uppercaseItem.querySelector('svg')!.getAttribute('class')).toContain('text-gray-400');
      expect(lowercaseItem.querySelector('svg')!.getAttribute('class')).toContain('text-green-500');
      expect(numberItem.querySelector('svg')!.getAttribute('class')).toContain('text-gray-400');
    });

    it('marks all requirements as met for a compliant password', () => {
      renderForm({ formData: { name: 'Ana', email: 'a@b.co', password: 'Password12345' } });

      expect(screen.getByText('Requisitos')).toBeInTheDocument();

      const items = [
        screen.getByText('Mínimo 12 caracteres').closest('li')!,
        screen.getByText('Una mayúscula').closest('li')!,
        screen.getByText('Una minúscula').closest('li')!,
        screen.getByText('Un número').closest('li')!,
      ];

      for (const item of items) {
        expect(item.querySelector('svg')!.getAttribute('class')).toContain('text-green-500');
      }
    });
  });

  describe('error rendering', () => {
    it('renders the error with role alert and desktop id, and links inputs to it', () => {
      renderForm({ error: 'Algo salió mal' });

      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('Algo salió mal');
      expect(alert).toHaveAttribute('id', 'error-desktop');

      const emailInput = screen.getByLabelText('Email');
      expect(emailInput).toHaveAttribute('aria-invalid', 'true');
      expect(emailInput).toHaveAttribute('aria-describedby', 'error-desktop');

      const passwordInput = screen.getByLabelText('Contraseña');
      expect(passwordInput).toHaveAttribute('aria-invalid', 'true');
      expect(passwordInput).toHaveAttribute('aria-describedby', 'error-desktop');
    });

    it('uses the mobile suffix for the error id when isMobile is true', () => {
      renderForm({ isMobile: true, error: 'Algo salió mal' });
      expect(screen.getByRole('alert')).toHaveAttribute('id', 'error-mobile');
      expect(screen.getByLabelText('Email')).toHaveAttribute('aria-describedby', 'error-mobile');
    });

    it('does not render an alert when there is no error', () => {
      renderForm();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'false');
      expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-describedby');
    });
  });

  describe('submit button state', () => {
    it('disables the submit button while loading', () => {
      renderForm({ loading: true, isFormValid: true });
      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('disables the submit button when the form is not valid', () => {
      renderForm({ loading: false, isFormValid: false });
      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('enables the submit button when valid and not loading', () => {
      renderForm({ loading: false, isFormValid: true });
      const button = screen.getByRole('button', { name: 'Registrarse' });
      expect(button).toBeEnabled();
    });

    it('shows the spinner and submitting label while loading', () => {
      const { container } = renderForm({ loading: true, isFormValid: true });

      expect(screen.getByText('Registrando...')).toBeInTheDocument();
      expect(container.querySelector('.animate-spin')).toBeInTheDocument();
      expect(screen.queryByText('Registrarse')).not.toBeInTheDocument();
    });
  });

  describe('field changes', () => {
    it('calls onFieldChange with the correct field and value', () => {
      const onFieldChange = vi.fn();
      renderForm({ onFieldChange });

      fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Ana' } });
      expect(onFieldChange).toHaveBeenCalledWith('name', 'Ana');

      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } });
      expect(onFieldChange).toHaveBeenCalledWith('email', 'a@b.co');

      fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'Password12345' } });
      expect(onFieldChange).toHaveBeenCalledWith('password', 'Password12345');
    });

    it('disables the inputs while loading', () => {
      renderForm({ loading: true });

      expect(screen.getByLabelText('Nombre')).toBeDisabled();
      expect(screen.getByLabelText('Email')).toBeDisabled();
      expect(screen.getByLabelText('Contraseña')).toBeDisabled();
    });
  });
});
