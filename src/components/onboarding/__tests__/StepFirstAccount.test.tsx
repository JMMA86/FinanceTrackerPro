/**
 * StepFirstAccount tests: client-side name validation, the exact payload sent
 * to `createBankAccount` (including the stable idempotency key), the success
 * state and the server error alert.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StepFirstAccount } from '../StepFirstAccount';
import type { OnboardingAccountSummary } from '../types';
import esOnboarding from '@/locales/es/onboarding.json';

const { createBankAccountMock } = vi.hoisted(() => ({ createBankAccountMock: vi.fn() }));

vi.mock('@/actions/account.actions', () => ({
  createBankAccount: (...args: unknown[]) => createBankAccountMock(...args),
}));

vi.mock('@/components/ui/FormattedNumericInput', () => ({
  FormattedNumericInput: ({
    id,
    value,
    onChange,
    className,
  }: {
    id?: string;
    value: number;
    onChange: (value: number) => void;
    className?: string;
  }) => (
    <input
      id={id}
      type="number"
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      data-testid={`numeric-input-${id}`}
      className={className}
    />
  ),
}));

const onboarding = esOnboarding as Record<string, unknown>;
const IDEMPOTENCY_KEY = '550e8400-e29b-41d4-a716-446655440000';

type StepFirstAccountProps = Parameters<typeof StepFirstAccount>[0];

function makeProps(overrides: Partial<StepFirstAccountProps> = {}): StepFirstAccountProps {
  return {
    headingRef: createRef<HTMLHeadingElement>(),
    titleId: 'onboarding-step-heading',
    dictionary: onboarding,
    baseCurrency: 'COP',
    idempotencyKey: IDEMPOTENCY_KEY,
    createdAccount: null,
    hasExistingAccounts: false,
    onCreated: vi.fn(),
    ...overrides,
  };
}

const CREATED_ACCOUNT: OnboardingAccountSummary = {
  id: 'account-1',
  name: 'Mi Cuenta',
  currency: 'COP',
};

describe('StepFirstAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the account form with the localized labels', () => {
    render(<StepFirstAccount {...makeProps()} />);

    expect(screen.getByRole('heading', { name: 'Crea tu primera cuenta' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre de la cuenta')).toBeInTheDocument();
    expect(screen.getByLabelText('Tipo de cuenta')).toBeInTheDocument();
    expect(screen.getByLabelText('Moneda')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear cuenta' })).toBeInTheDocument();
  });

  it('shows the required-name error when submitting an empty form', async () => {
    render(<StepFirstAccount {...makeProps()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Ingresa un nombre para la cuenta.');
    });
    expect(createBankAccountMock).not.toHaveBeenCalled();
  });

  it('shows the invalid-name error for unsupported characters', async () => {
    render(<StepFirstAccount {...makeProps()} />);

    fireEvent.change(screen.getByLabelText('Nombre de la cuenta'), {
      target: { value: '<script>alert(1)</script>' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'El nombre contiene caracteres no permitidos.'
      );
    });
    expect(createBankAccountMock).not.toHaveBeenCalled();
  });

  it('submits the form with the stable idempotency key and reports the created account', async () => {
    createBankAccountMock.mockResolvedValue({
      success: true,
      data: { account: CREATED_ACCOUNT },
    });
    const onCreated = vi.fn();
    render(<StepFirstAccount {...makeProps({ onCreated })} />);

    fireEvent.change(screen.getByLabelText('Nombre de la cuenta'), {
      target: { value: 'Mi Cuenta' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    await waitFor(() => {
      expect(createBankAccountMock).toHaveBeenCalledTimes(1);
    });

    expect(createBankAccountMock).toHaveBeenCalledWith({
      idempotencyKey: IDEMPOTENCY_KEY,
      name: 'Mi Cuenta',
      type: 'CHECKING',
      currency: 'COP',
      initialBalanceCents: 0,
    });
    expect(onCreated).toHaveBeenCalledWith(CREATED_ACCOUNT);
  });

  it('keeps the idempotency key stable across retries', async () => {
    createBankAccountMock.mockResolvedValue({ success: false, code: 'X', error: 'boom' });
    render(<StepFirstAccount {...makeProps()} />);

    fireEvent.change(screen.getByLabelText('Nombre de la cuenta'), {
      target: { value: 'Mi Cuenta' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    await waitFor(() => expect(createBankAccountMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    await waitFor(() => expect(createBankAccountMock).toHaveBeenCalledTimes(2));

    const [first, second] = createBankAccountMock.mock.calls;
    expect((first[0] as { idempotencyKey: string }).idempotencyKey).toBe(IDEMPOTENCY_KEY);
    expect((second[0] as { idempotencyKey: string }).idempotencyKey).toBe(IDEMPOTENCY_KEY);
  });

  it('renders the success state with the created account summary', () => {
    render(<StepFirstAccount {...makeProps({ createdAccount: CREATED_ACCOUNT })} />);

    expect(screen.getByRole('status')).toHaveTextContent('¡Cuenta creada!');
    expect(screen.getByText('Tu cuenta «Mi Cuenta» está lista.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nombre de la cuenta')).not.toBeInTheDocument();
  });

  it('shows the server error alert when createBankAccount fails', async () => {
    createBankAccountMock.mockResolvedValue({
      success: false,
      code: 'VALIDATION_ERROR',
      error: 'invalid',
    });
    render(<StepFirstAccount {...makeProps()} />);

    fireEvent.change(screen.getByLabelText('Nombre de la cuenta'), {
      target: { value: 'Mi Cuenta' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('No se pudo crear la cuenta.');
    });
  });

  it('shows the session error when the server rejects the session', async () => {
    createBankAccountMock.mockResolvedValue({
      success: false,
      code: 'SESSION_INVALID',
      error: 'expired',
    });
    render(<StepFirstAccount {...makeProps()} />);

    fireEvent.change(screen.getByLabelText('Nombre de la cuenta'), {
      target: { value: 'Mi Cuenta' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Tu sesión expiró. Inicia sesión nuevamente.'
      );
    });
  });

  it('shows the existing-accounts note when the user already has accounts', () => {
    render(<StepFirstAccount {...makeProps({ hasExistingAccounts: true })} />);

    expect(
      screen.getByText('Ya tienes cuentas creadas. Puedes continuar o crear una nueva.')
    ).toBeInTheDocument();
  });
});
