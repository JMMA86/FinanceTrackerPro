/**
 * StepSalary tests: the optional onboarding step that reuses `SalaryForm`.
 * Covers the prefill from an existing configuration, the optional (never
 * blocking) save semantics and the success/error feedback.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StepSalary } from '../StepSalary';
import { t } from '../i18n-helpers';
import esOnboarding from '@/locales/es/onboarding.json';

const { mockGetSalaryConfiguration, mockSaveSalaryConfiguration } = vi.hoisted(() => ({
  mockGetSalaryConfiguration: vi.fn(),
  mockSaveSalaryConfiguration: vi.fn(),
}));

vi.mock('@/actions/salary.actions', () => ({
  getSalaryConfiguration: (...args: unknown[]) => mockGetSalaryConfiguration(...args),
  saveSalaryConfiguration: (...args: unknown[]) => mockSaveSalaryConfiguration(...args),
}));

const dictionary = esOnboarding as Record<string, unknown>;

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    headingRef: createRef<HTMLHeadingElement>(),
    titleId: 'onboarding-step-heading',
    dictionary,
    lang: 'es' as const,
    onConfigured: vi.fn(),
    ...overrides,
  };
}

describe('StepSalary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSalaryConfiguration.mockResolvedValue({
      success: true,
      data: { configured: false, configuration: null },
    });
  });

  it('renders the heading, the optional note and the form after loading', async () => {
    render(<StepSalary {...makeProps()} />);

    expect(screen.getByRole('heading', { name: 'Configura tu sueldo' })).toBeInTheDocument();
    expect(await screen.findByLabelText('Monto por período')).toBeInTheDocument();
    expect(screen.getByText(/Este paso es opcional/)).toBeInTheDocument();
  });

  it('reports "not configured" when there is no active salary', async () => {
    const onConfigured = vi.fn();
    render(<StepSalary {...makeProps({ onConfigured })} />);

    await screen.findByLabelText('Monto por período');

    expect(onConfigured).toHaveBeenCalledWith(false);
  });

  it('prefills the form and reports the existing configuration', async () => {
    const onConfigured = vi.fn();
    mockGetSalaryConfiguration.mockResolvedValue({
      success: true,
      data: {
        configured: true,
        configuration: {
          id: 'cfg-1',
          amountCents: 2_000_000,
          currency: 'COP',
          frequency: 'MONTHLY',
          payDays: [15],
          bonuses: [],
        },
      },
    });

    render(<StepSalary {...makeProps({ onConfigured })} />);

    expect(await screen.findByLabelText('Día del mes')).toHaveValue(15);
    expect(onConfigured).toHaveBeenCalledWith(true);
  });

  it('saves the salary and shows the success block', async () => {
    const onConfigured = vi.fn();
    mockSaveSalaryConfiguration.mockResolvedValue({
      success: true,
      data: {
        configured: true,
        configuration: {
          id: 'cfg-1',
          amountCents: 4_000_000,
          currency: 'COP',
          frequency: 'MONTHLY',
          payDays: [30],
          bonuses: [],
        },
      },
    });

    render(<StepSalary {...makeProps({ onConfigured })} />);
    const amount = await screen.findByLabelText('Monto por período');
    for (const digit of '4000000') {
      fireEvent.keyDown(amount, { key: digit });
    }

    fireEvent.click(screen.getByRole('button', { name: 'Guardar sueldo' }));

    expect(await screen.findByText('¡Sueldo configurado!')).toBeInTheDocument();
    expect(mockSaveSalaryConfiguration).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onConfigured).toHaveBeenCalledWith(true));
  });

  it('maps a session failure to the localized error (and stays usable)', async () => {
    mockSaveSalaryConfiguration.mockResolvedValue({
      success: false,
      code: 'SESSION_INVALID',
      error: 'expired',
    });

    render(<StepSalary {...makeProps()} />);
    const amount = await screen.findByLabelText('Monto por período');
    for (const digit of '1000') {
      fireEvent.keyDown(amount, { key: digit });
    }

    fireEvent.click(screen.getByRole('button', { name: 'Guardar sueldo' }));

    expect(await screen.findByText(t(dictionary, 'errors.sessionInvalid'))).toBeInTheDocument();
  });
});
