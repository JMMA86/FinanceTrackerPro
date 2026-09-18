/**
 * SalarySettingsSection tests: the Settings surface for the salary/bonus config
 * plus the COP-only monthly savings target.
 *
 * The salary Server Actions are mocked; the section's own orchestration (load
 * states, save feedback and error mapping) is what these tests lock.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SalarySettingsSection } from '../SalarySettingsSection';
import esSettings from '@/locales/es/settings.json';
import type { SalaryConfigurationData } from '@/actions/salary.actions';

const {
  mockGetSalaryConfiguration,
  mockGetProjectionSettings,
  mockSaveSalaryConfiguration,
  mockSaveProjectionSettings,
} = vi.hoisted(() => ({
  mockGetSalaryConfiguration: vi.fn(),
  mockGetProjectionSettings: vi.fn(),
  mockSaveSalaryConfiguration: vi.fn(),
  mockSaveProjectionSettings: vi.fn(),
}));

vi.mock('@/actions/salary.actions', () => ({
  getSalaryConfiguration: (...args: unknown[]) => mockGetSalaryConfiguration(...args),
  getProjectionSettings: (...args: unknown[]) => mockGetProjectionSettings(...args),
  saveSalaryConfiguration: (...args: unknown[]) => mockSaveSalaryConfiguration(...args),
  saveProjectionSettings: (...args: unknown[]) => mockSaveProjectionSettings(...args),
}));

const dictionary = esSettings as Record<string, unknown>;

const CONFIGURATION: SalaryConfigurationData = {
  id: 'cfg-1',
  amountCents: 3_000_000,
  currency: 'COP',
  frequency: 'MONTHLY',
  payDays: [15],
  bonuses: [],
};

function setupDefaultMocks() {
  mockGetSalaryConfiguration.mockResolvedValue({
    success: true,
    data: { configured: true, configuration: CONFIGURATION },
  });
  mockGetProjectionSettings.mockResolvedValue({
    success: true,
    data: { configured: false, monthlySavingsTargetCents: 0, currency: 'COP' },
  });
}

async function renderReady() {
  render(<SalarySettingsSection dictionary={dictionary} lang="es" />);
  await screen.findByLabelText('Meta mensual (COP)');
}

describe('SalarySettingsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('loads the configuration and renders the salary form', async () => {
    await renderReady();

    expect(mockGetSalaryConfiguration).toHaveBeenCalledWith({});
    expect(screen.getByText('Ingresos y primas')).toBeInTheDocument();
    expect(screen.getByLabelText('Monto por período')).toBeInTheDocument();
    // Existing configuration prefill.
    expect(screen.getByLabelText('Día del mes')).toHaveValue(15);
    // The target is not set yet.
    expect(screen.getByText('Todavía no has definido una meta de ahorro.')).toBeInTheDocument();
  });

  it('shows the "not configured" notice when there is no active salary', async () => {
    mockGetSalaryConfiguration.mockResolvedValue({
      success: true,
      data: { configured: false, configuration: null },
    });

    await renderReady();

    expect(screen.getByText('Todavía no has configurado tu sueldo.')).toBeInTheDocument();
  });

  it('saves the monthly COP savings target and shows the success feedback', async () => {
    mockSaveProjectionSettings.mockResolvedValue({
      success: true,
      data: { configured: true, monthlySavingsTargetCents: 100_000, currency: 'COP' },
    });

    await renderReady();

    const target = screen.getByLabelText('Meta mensual (COP)');
    for (const digit of '100000') {
      fireEvent.keyDown(target, { key: digit });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Guardar meta' }));

    await waitFor(() =>
      expect(mockSaveProjectionSettings).toHaveBeenCalledWith({
        monthlySavingsTargetCents: 100_000,
        currency: 'COP',
      })
    );
    expect(await screen.findByText('Meta de ahorro guardada correctamente.')).toBeInTheDocument();
  });

  it('maps a failed target save to the localized error', async () => {
    mockSaveProjectionSettings.mockResolvedValue({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      error: 'boom',
    });

    await renderReady();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar meta' }));

    expect(await screen.findByText('No se pudo guardar la meta de ahorro.')).toBeInTheDocument();
  });

  it('maps an expired session on target save to the session message', async () => {
    mockSaveProjectionSettings.mockResolvedValue({
      success: false,
      code: 'SESSION_INVALID',
      error: 'expired',
    });

    await renderReady();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar meta' }));

    expect(
      await screen.findByText('Tu sesión expiró. Inicia sesión nuevamente.')
    ).toBeInTheDocument();
  });

  it('shows a load error with retry, and retries the reads on click', async () => {
    mockGetSalaryConfiguration.mockResolvedValueOnce({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      error: 'boom',
    });

    render(<SalarySettingsSection dictionary={dictionary} lang="es" />);

    expect(
      await screen.findByText('No se pudo cargar tu configuración de ingresos.')
    ).toBeInTheDocument();

    mockGetSalaryConfiguration.mockResolvedValue({
      success: true,
      data: { configured: true, configuration: CONFIGURATION },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    await waitFor(() => expect(mockGetSalaryConfiguration).toHaveBeenCalledTimes(2));
    expect(await screen.findByLabelText('Monto por período')).toBeInTheDocument();
  });

  it('re-seeds the form from the persisted configuration after saving a salary', async () => {
    mockSaveSalaryConfiguration.mockResolvedValue({
      success: true,
      data: {
        configured: true,
        configuration: {
          ...CONFIGURATION,
          amountCents: 5_000_000,
          bonuses: [
            {
              id: 'bonus-1',
              name: 'Prima',
              amountCents: 200_000,
              currency: 'COP',
              frequency: 'ANNUAL',
              anchorMonth: 12,
              dayOfMonth: null,
            },
          ],
        },
      },
    });

    await renderReady();

    const amount = screen.getByLabelText('Monto por período');
    for (const digit of '5000000') {
      fireEvent.keyDown(amount, { key: digit });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Guardar configuración' }));

    expect(await screen.findByText('Ingresos guardados correctamente.')).toBeInTheDocument();
    expect(mockSaveSalaryConfiguration).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Prima 1')).toBeInTheDocument();
  });
});
