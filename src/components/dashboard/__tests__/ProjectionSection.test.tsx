/**
 * ProjectionSection tests: the end-of-period projection card pair.
 *
 * The dashboard passes a fully-computed `DashboardProjection` (COP cents), so
 * these tests lock presentation: the empty state, the month/year cards, the
 * salary status badge, the explainable breakdown disclosure, the deficit state
 * and the unconvertible-currency warning.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ProjectionSection } from '../ProjectionSection';
import esDashboard from '@/locales/es/dashboard.json';
import type {
  DashboardProjection,
  ProjectionBreakdownLine,
  ProjectionPeriod,
  ProjectionPeriodKey,
} from '@/types/dashboard';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: unknown;
    children?: ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={typeof href === 'string' ? href : '#'} {...props}>
      {children}
    </a>
  ),
}));

const dictionary = esDashboard as Record<string, unknown>;

function line(overrides: Partial<ProjectionBreakdownLine> = {}): ProjectionBreakdownLine {
  return {
    key: 'cash',
    amountCents: 1_000_000,
    currency: 'COP',
    sourceCurrency: 'COP',
    originalAmountCents: 1_000_000,
    exchangeRate: null,
    source: 'CURRENT_CASH',
    count: 2,
    detail: 'Saldo líquido actual (2 cuenta(s))',
    ...overrides,
  };
}

function makePeriod(period: ProjectionPeriodKey, overrides: Partial<ProjectionPeriod> = {}) {
  return {
    period,
    asOf: new Date(2026, 8, 20, 12),
    periodStart: new Date(2026, 8, 1),
    periodEnd: new Date(2026, 8, 30),
    currentCashCents: 1_000_000,
    investmentValueCents: 500_000,
    salaryReceivedCents: 0,
    salaryPendingCents: 2_000_000,
    salaryStatus: 'PENDING' as const,
    nextSalaryDate: new Date(2026, 8, 25, 12),
    nextSalaryAmountCents: 2_000_000,
    salaryOccurrences: [
      {
        date: new Date(2026, 8, 25, 12),
        amountCents: 2_000_000,
        currency: 'COP' as const,
        received: false,
      },
    ],
    remainingIncomeCents: 2_000_000,
    remainingFixedCents: 300_000,
    remainingLoanPaymentsCents: 0,
    remainingLoanPrincipalCents: 0,
    remainingLoanInterestCents: 0,
    remainingLoanReceivableCents: 0,
    remainingLoanReceivablePrincipalCents: 0,
    remainingLoanReceivableInterestCents: 0,
    remainingVariableBudgetCents: 200_000,
    remainingSavingsTargetCents: 0,
    projectedEndCents: 3_000_000,
    remainingToSpendCents: 1_700_000,
    projectedSurplusCents: 1_500_000,
    overBudget: false,
    breakdown: [
      line(),
      line({
        key: 'fixed',
        amountCents: 300_000,
        sourceCurrency: 'COP',
        originalAmountCents: 300_000,
        source: 'FIXED_EXPENSES_PENDING',
        count: 1,
        detail: '1 pago(s) fijo(s) pendientes',
      }),
    ],
    ...overrides,
  } satisfies ProjectionPeriod;
}

function makeProjection(overrides: Partial<DashboardProjection> = {}): DashboardProjection {
  return {
    configured: true,
    targetConfigured: true,
    currency: 'COP',
    month: makePeriod('month'),
    year: makePeriod('year'),
    exchangeRatesUsed: {},
    unconverted: false,
    unconvertedByCurrency: {},
    ...overrides,
  };
}

function renderSection(projection: DashboardProjection) {
  return render(
    <ProjectionSection projection={projection} lang="es" dictionary={dictionary} locale="es-CO" />
  );
}

describe('ProjectionSection', () => {
  it('renders the empty state (with the settings CTA) when no salary is configured', () => {
    renderSection(makeProjection({ configured: false }));

    expect(screen.getByText('Proyección de fin de período')).toBeInTheDocument();
    expect(screen.getByText('Todavía no hay proyección')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Configurar sueldo y primas/ })).toHaveAttribute(
      'href',
      '/es/settings'
    );
  });

  it('renders the month and year cards with the salary status badges', () => {
    renderSection(makeProjection());

    expect(screen.getByText('Este mes')).toBeInTheDocument();
    expect(screen.getByText('Este año')).toBeInTheDocument();
    // One PENDING badge per card.
    expect(screen.getAllByText('Salario pendiente')).toHaveLength(2);
    expect(screen.getAllByText('Cierre proyectado')).toHaveLength(2);
    expect(screen.getAllByText('Superávit proyectado')).toHaveLength(2);
  });

  it('renders the deficit label when a period is over budget', () => {
    renderSection(
      makeProjection({
        month: makePeriod('month', { overBudget: true, projectedSurplusCents: -50_000 }),
      })
    );

    expect(screen.getByText('Déficit proyectado')).toBeInTheDocument();
  });

  it('shows a configure CTA per card when the salary is NOT_CONFIGURED', () => {
    renderSection(
      makeProjection({
        month: makePeriod('month', { salaryStatus: 'NOT_CONFIGURED', salaryOccurrences: [] }),
        year: makePeriod('year', { salaryStatus: 'NOT_CONFIGURED', salaryOccurrences: [] }),
      })
    );

    expect(screen.getAllByText('Sueldo no configurado')).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: /Configurar sueldo/ })).toHaveLength(2);
  });

  it('warns when some amounts could not be converted (Rule 9)', () => {
    renderSection(
      makeProjection({
        unconverted: true,
        unconvertedByCurrency: { USD: { count: 1, amountCents: 150_000 } },
      })
    );

    expect(
      screen.getByText(/Algunos montos en otra moneda no se pudieron convertir/)
    ).toBeInTheDocument();
    expect(screen.getByText('USD')).toBeInTheDocument();
  });

  it('nudges the user to define the monthly savings target when it is missing', () => {
    renderSection(makeProjection({ targetConfigured: false }));

    expect(screen.getByText(/Define tu meta mensual de ahorro/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Definir meta/ })).toBeInTheDocument();
  });

  it('expands the explainable breakdown into inflows and outflows', () => {
    renderSection(makeProjection());

    const [firstCard] = screen.getAllByText('Este mes').map((el) => el.closest('article')!);
    const toggle = within(firstCard).getByRole('button', { name: '¿Cómo se calculó?' });

    fireEvent.click(toggle);

    expect(within(firstCard).getByText('Entradas')).toBeInTheDocument();
    expect(within(firstCard).getByText('Salidas')).toBeInTheDocument();
    expect(within(firstCard).getByText('Efectivo disponible hoy')).toBeInTheDocument();
    expect(within(firstCard).getByText('Gastos fijos por pagar')).toBeInTheDocument();
    expect(
      within(firstCard).getByRole('button', { name: 'Ocultar el cálculo' })
    ).toBeInTheDocument();
  });

  it('renders an FX note for a converted foreign line', () => {
    renderSection(
      makeProjection({
        month: makePeriod('month', {
          breakdown: [
            line({
              sourceCurrency: 'USD',
              originalAmountCents: 25_000,
              amountCents: 100_000_000,
              exchangeRate: 4_000,
            }),
          ],
        }),
      })
    );

    const [firstCard] = screen.getAllByText('Este mes').map((el) => el.closest('article')!);
    fireEvent.click(within(firstCard).getByRole('button', { name: '¿Cómo se calculó?' }));

    expect(within(firstCard).getByText(/Tasa aplicada/)).toBeInTheDocument();
  });
});
