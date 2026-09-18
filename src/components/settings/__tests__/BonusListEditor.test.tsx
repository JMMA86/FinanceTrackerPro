/**
 * BonusListEditor tests: the controlled add / edit / remove list of bonuses.
 * Covers the empty state, add/remove round-trips, field updates, per-item error
 * surfacing and the max-bonuses cap.
 */

import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BonusListEditor, type BonusDraft } from '../BonusListEditor';
import esSettings from '@/locales/es/settings.json';

const dictionary = esSettings as Record<string, unknown>;

interface HarnessProps {
  initial?: BonusDraft[];
  maxBonuses?: number;
  getItemError?: (index: number) => string | undefined;
  listError?: string;
}

/** Small controlled wrapper so interactions drive real state updates. */
function Harness({
  initial = [],
  maxBonuses = 20,
  getItemError = () => undefined,
  listError,
}: HarnessProps) {
  const [bonuses, setBonuses] = useState<BonusDraft[]>(initial);
  return (
    <BonusListEditor
      bonuses={bonuses}
      onChange={setBonuses}
      dictionary={dictionary}
      prefix="salary.form"
      locale="es-CO"
      idPrefix="test"
      maxBonuses={maxBonuses}
      getItemError={getItemError}
      listError={listError}
    />
  );
}

const BONUS: BonusDraft = {
  id: 'bonus-1',
  name: 'Prima de servicios',
  amountCents: 1_000_000,
  currency: 'COP',
  frequency: 'ANNUAL',
  anchorMonth: 12,
  dayOfMonth: 20,
};

describe('BonusListEditor', () => {
  it('renders the empty state and adds a fresh bonus', () => {
    render(<Harness />);

    expect(screen.getByText('Todavía no has agregado primas.')).toBeInTheDocument();
    expect(screen.queryByText('Prima 1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Añadir prima' }));

    expect(screen.getByText('Prima 1')).toBeInTheDocument();
    expect(screen.queryByText('Todavía no has agregado primas.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toHaveValue('');
    expect(screen.getByLabelText('Mes')).toHaveValue('1');
  });

  it('updates the bonus name and currency in place', () => {
    render(<Harness initial={[{ ...BONUS, id: undefined }]} />);

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Bono anual' } });
    expect(screen.getByLabelText('Nombre')).toHaveValue('Bono anual');

    fireEvent.change(screen.getByLabelText('Moneda'), { target: { value: 'USD' } });
    expect(screen.getByLabelText('Moneda')).toHaveValue('USD');
  });

  it('updates the frequency and anchor month', () => {
    render(<Harness initial={[{ ...BONUS, id: undefined }]} />);

    fireEvent.change(screen.getByLabelText('Frecuencia'), { target: { value: 'QUARTERLY' } });
    expect(screen.getByLabelText('Frecuencia')).toHaveValue('QUARTERLY');

    fireEvent.change(screen.getByLabelText('Mes'), { target: { value: '3' } });
    expect(screen.getByLabelText('Mes')).toHaveValue('3');
  });

  it('removes a bonus from the list', () => {
    render(<Harness initial={[BONUS]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Quitar' }));

    expect(screen.queryByText('Prima 1')).not.toBeInTheDocument();
    expect(screen.getByText('Todavía no has agregado primas.')).toBeInTheDocument();
  });

  it('renders the per-item validation error and links it to the fields', () => {
    render(<Harness initial={[BONUS]} getItemError={() => 'Ingresa un nombre para la prima.'} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Ingresa un nombre para la prima.');
    expect(screen.getByLabelText('Nombre')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Nombre')).toHaveAttribute(
      'aria-describedby',
      'test-bonus-0-error'
    );
  });

  it('renders the list-level error', () => {
    render(<Harness listError="No se permiten más de 20 primas." />);

    expect(screen.getByRole('alert')).toHaveTextContent('No se permiten más de 20 primas.');
  });

  it('disables the add button when the max is reached', () => {
    render(<Harness initial={[BONUS]} maxBonuses={1} />);

    expect(screen.getByRole('button', { name: 'Añadir prima' })).toBeDisabled();
  });

  it('labels every month option with a capitalized localized name', () => {
    render(<Harness initial={[BONUS]} />);

    expect(screen.getByRole('option', { name: 'Enero' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Diciembre' })).toBeInTheDocument();
  });
});
