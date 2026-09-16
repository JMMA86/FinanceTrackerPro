/**
 * OnboardingProgress tests: accessible stepper rendering (4 items, aria-current
 * on the active step, done/current/pending visuals and localized labels).
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OnboardingProgress } from '../OnboardingProgress';
import { ONBOARDING_STEPS } from '@/lib/onboarding/steps';

const LABELS = {
  welcome: 'Bienvenida',
  account: 'Cuenta',
  modules: 'Módulos',
  finish: 'Listo',
} as const;

function renderProgress(current: number) {
  return render(<OnboardingProgress current={current} labels={LABELS} ariaLabel="Progreso" />);
}

describe('OnboardingProgress', () => {
  it('renders one item per onboarding step', () => {
    renderProgress(0);

    expect(ONBOARDING_STEPS).toHaveLength(4);
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
  });

  it('exposes an accessible navigation landmark', () => {
    renderProgress(0);

    expect(screen.getByRole('navigation', { name: 'Progreso' })).toBeInTheDocument();
  });

  it('marks only the active step with aria-current="step"', () => {
    renderProgress(2);
    const items = screen.getAllByRole('listitem');

    expect(items[2]).toHaveAttribute('aria-current', 'step');
    expect(items[0]).not.toHaveAttribute('aria-current');
    expect(items[1]).not.toHaveAttribute('aria-current');
    expect(items[3]).not.toHaveAttribute('aria-current');
  });

  it('renders the localized label for every step', () => {
    renderProgress(0);

    for (const label of Object.values(LABELS)) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('shows a check icon for done steps and the index for current/pending ones', () => {
    renderProgress(2);
    const items = screen.getAllByRole('listitem');

    // Steps 0 and 1 are done → check icon, no number.
    expect(items[0].querySelector('svg')).not.toBeNull();
    expect(items[1].querySelector('svg')).not.toBeNull();
    // Step 2 is current and step 3 is pending → their ordinal is displayed.
    expect(items[2].querySelector('svg')).toBeNull();
    expect(items[2]).toHaveTextContent('3');
    expect(items[3].querySelector('svg')).toBeNull();
    expect(items[3]).toHaveTextContent('4');
  });
});
