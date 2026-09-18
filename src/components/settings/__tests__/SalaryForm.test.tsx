/**
 * SalaryForm tests: the reusable salary + bonuses form shared by Settings and the
 * onboarding walkthrough.
 *
 * Covers the frequency-driven `payDays` UX (MONTHLY / BIWEEKLY / WEEKLY), the
 * client-side validation mirror, the submit payload and the imperative
 * `requestSubmit` contract used by the onboarding "Continue" CTA.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SalaryForm, type SalaryFormHandle } from '../SalaryForm';
import esSettings from '@/locales/es/settings.json';

const dictionary = esSettings as Record<string, unknown>;

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    dictionary,
    prefix: 'salary.form',
    locale: 'es-CO',
    idPrefix: 'test-salary',
    initialConfiguration: null,
    onSubmit: vi.fn().mockResolvedValue({ success: true }),
    ...overrides,
  };
}

/** Types a run of digits into a FormattedNumericInput. */
function typeDigits(input: HTMLElement, digits: string) {
  for (const digit of digits) {
    fireEvent.keyDown(input, { key: digit });
  }
}

describe('SalaryForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the MONTHLY defaults (single day-of-month input)', () => {
    render(<SalaryForm {...makeProps()} />);

    expect(screen.getByLabelText('Monto por período')).toBeInTheDocument();
    expect(screen.getByLabelText('Día del mes')).toHaveValue(30);
    expect(screen.getByLabelText('Frecuencia de pago')).toHaveValue('MONTHLY');
    expect(screen.getByLabelText('Moneda')).toHaveValue('COP');
    // No bonus yet.
    expect(screen.getByText('Todavía no has agregado primas.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar configuración' })).toBeInTheDocument();
  });

  it('switches to BIWEEKLY with two day-of-month inputs', () => {
    render(<SalaryForm {...makeProps()} />);

    fireEvent.change(screen.getByLabelText('Frecuencia de pago'), {
      target: { value: 'BIWEEKLY' },
    });

    expect(screen.getByLabelText('Primer día del mes')).toHaveValue(15);
    expect(screen.getByLabelText('Segundo día del mes')).toHaveValue(30);
  });

  it('switches to WEEKLY with a single ISO weekday select', () => {
    render(<SalaryForm {...makeProps()} />);

    fireEvent.change(screen.getByLabelText('Frecuencia de pago'), {
      target: { value: 'WEEKLY' },
    });

    const weekday = screen.getByLabelText('Día de la semana');
    expect(weekday).toHaveValue('1'); // Monday
    expect(screen.getByRole('option', { name: 'Lunes' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Domingo' })).toBeInTheDocument();
    // The monthly day input is gone.
    expect(screen.queryByLabelText('Día del mes')).not.toBeInTheDocument();
  });

  it('seeds the form from an existing configuration (and normalizes payDays)', () => {
    render(
      <SalaryForm
        {...makeProps({
          initialConfiguration: {
            amountCents: 2_500_000,
            currency: 'USD',
            frequency: 'WEEKLY',
            // Legacy/invalid array for WEEKLY → coerced to a valid weekday.
            payDays: [9, 9],
            bonuses: [],
          },
        })}
      />
    );

    expect(screen.getByLabelText('Moneda')).toHaveValue('USD');
    expect(screen.getByLabelText('Día de la semana')).toHaveValue('1');
  });

  it('rejects an empty amount on submit with the localized message', async () => {
    const onSubmit = vi.fn();
    render(<SalaryForm {...makeProps({ onSubmit })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Guardar configuración' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Ingresa un monto mayor que cero.');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits the exact payload the Server Action expects', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ success: true });
    render(<SalaryForm {...makeProps({ onSubmit })} />);

    typeDigits(screen.getByLabelText('Monto por período'), '100000');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar configuración' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      amountCents: 100_000,
      currency: 'COP',
      frequency: 'MONTHLY',
      payDays: [30],
      bonuses: [],
    });
  });

  it('surfaces the server error returned by onSubmit', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ success: false, error: 'falló el guardado' });
    render(<SalaryForm {...makeProps({ onSubmit })} />);

    typeDigits(screen.getByLabelText('Monto por período'), '5000');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar configuración' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('falló el guardado');
  });

  it('adds a bonus into the payload (new bonuses omit the id)', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ success: true });
    render(<SalaryForm {...makeProps({ onSubmit })} />);

    typeDigits(screen.getByLabelText('Monto por período'), '100000');
    fireEvent.click(screen.getByRole('button', { name: 'Añadir prima' }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Prima' } });
    typeDigits(screen.getByLabelText('Monto'), '50000');
    fireEvent.change(screen.getByLabelText('Mes'), { target: { value: '12' } });

    fireEvent.click(screen.getByRole('button', { name: 'Guardar configuración' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.bonuses).toHaveLength(1);
    expect(payload.bonuses[0]).toMatchObject({
      name: 'Prima',
      currency: 'COP',
      frequency: 'MONTHLY',
      anchorMonth: 12,
      dayOfMonth: null,
    });
    expect(payload.bonuses[0].id).toBeUndefined();
  });

  describe('requestSubmit (imperative handle)', () => {
    it('resolves "skipped" for an untouched form', async () => {
      const onSubmit = vi.fn();
      const ref = createRef<SalaryFormHandle>();
      render(<SalaryForm {...makeProps({ onSubmit, submitRef: ref })} />);

      const outcome = await ref.current!.requestSubmit();

      expect(outcome).toBe('skipped');
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('resolves "saved" after a successful programmatic submit', async () => {
      const onSubmit = vi.fn().mockResolvedValue({ success: true });
      const ref = createRef<SalaryFormHandle>();
      render(<SalaryForm {...makeProps({ onSubmit, submitRef: ref })} />);

      typeDigits(screen.getByLabelText('Monto por período'), '200000');
      const outcome = await ref.current!.requestSubmit();

      expect(outcome).toBe('saved');
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 200_000 }));
    });

    it('resolves "invalid" when the server rejects the save', async () => {
      const onSubmit = vi.fn().mockResolvedValue({ success: false, error: 'nope' });
      const ref = createRef<SalaryFormHandle>();
      render(<SalaryForm {...makeProps({ onSubmit, submitRef: ref })} />);

      typeDigits(screen.getByLabelText('Monto por período'), '1000');
      const outcome = await ref.current!.requestSubmit();

      expect(outcome).toBe('invalid');
    });
  });
});
