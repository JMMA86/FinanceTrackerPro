/**
 * StepFinish tests: the summary shows the chosen language, the created account
 * (or the "not yet" fallback), the main currency and the salary status.
 */

import { describe, it, expect } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { StepFinish } from '../StepFinish';
import type { OnboardingAccountSummary } from '../types';
import esOnboarding from '@/locales/es/onboarding.json';
import esCommon from '@/locales/es/common.json';

const onboarding = esOnboarding as Record<string, unknown>;
const common = esCommon as Record<string, unknown>;

const ACCOUNT: OnboardingAccountSummary = {
  id: 'account-1',
  name: 'Nómina Bancolombia',
  currency: 'COP',
};

type StepFinishProps = Parameters<typeof StepFinish>[0];

function makeProps(overrides: Partial<StepFinishProps> = {}): StepFinishProps {
  return {
    headingRef: createRef<HTMLHeadingElement>(),
    titleId: 'onboarding-step-heading',
    dictionary: onboarding,
    common,
    baseCurrency: 'COP',
    account: ACCOUNT,
    salaryConfigured: false,
    lang: 'es',
    ...overrides,
  };
}

describe('StepFinish', () => {
  it('renders the summary heading', () => {
    render(<StepFinish {...makeProps()} />);

    expect(screen.getByRole('heading', { name: '¡Todo listo!' })).toBeInTheDocument();
    expect(screen.getByText('Resumen')).toBeInTheDocument();
  });

  it('summarizes the language, account and currency in Spanish', () => {
    render(<StepFinish {...makeProps({ lang: 'es' })} />);

    expect(screen.getByText('Idioma')).toBeInTheDocument();
    expect(screen.getByText('🇪🇸 Español')).toBeInTheDocument();
    expect(screen.getByText('Primera cuenta')).toBeInTheDocument();
    expect(screen.getByText('Nómina Bancolombia')).toBeInTheDocument();
    expect(screen.getByText('Moneda principal')).toBeInTheDocument();
    expect(screen.getByText('COP · Peso colombiano')).toBeInTheDocument();
  });

  it('reflects the English locale in the summary', () => {
    render(<StepFinish {...makeProps({ lang: 'en' })} />);

    expect(screen.getByText('🇬🇧 English')).toBeInTheDocument();
  });

  it('summarizes the salary as not configured by default', () => {
    render(<StepFinish {...makeProps()} />);

    expect(screen.getByText('Sueldo configurado')).toBeInTheDocument();
    // The account exists, so only the salary row renders the "not yet" fallback.
    expect(screen.getAllByText('Aún no')).toHaveLength(1);
  });

  it('marks the salary row as done when a salary was configured', () => {
    render(<StepFinish {...makeProps({ salaryConfigured: true })} />);

    expect(screen.getByText('Sí')).toBeInTheDocument();
    expect(screen.queryByText('Aún no')).not.toBeInTheDocument();
  });

  it('falls back to the "not yet" copy when no account was created', () => {
    render(<StepFinish {...makeProps({ account: null })} />);

    // Account row + salary row (not configured) both fall back to "not yet".
    expect(screen.getAllByText('Aún no')).toHaveLength(2);
    expect(screen.queryByText(ACCOUNT.name)).not.toBeInTheDocument();
  });
});
