/**
 * StepExploreModules tests: the read-only tour renders every navigation module
 * with its localized name and description from the `common` dictionary.
 */

import { describe, it, expect } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { StepExploreModules } from '../StepExploreModules';
import { navigationItems } from '@/config/navigation';
import { get } from '@/lib/i18n';
import esOnboarding from '@/locales/es/onboarding.json';
import esCommon from '@/locales/es/common.json';

const onboarding = esOnboarding as Record<string, unknown>;
const common = esCommon as Record<string, unknown>;

function renderStep() {
  return render(
    <StepExploreModules
      headingRef={createRef<HTMLHeadingElement>()}
      titleId="onboarding-step-heading"
      dictionary={onboarding}
      common={common}
    />
  );
}

describe('StepExploreModules', () => {
  it('renders one list item per navigation module', () => {
    renderStep();

    expect(navigationItems).toHaveLength(9);
    expect(screen.getAllByRole('listitem')).toHaveLength(9);
  });

  it('localizes every module name and description from the common dictionary', () => {
    renderStep();

    for (const item of navigationItems) {
      const name = get(common, `navigation.${item.nameKey}`);
      const description = get(common, `navigation.${item.descKey}`);
      expect(name).not.toBe(`navigation.${item.nameKey}`);
      expect(description).not.toBe(`navigation.${item.descKey}`);
      expect(screen.getByText(name)).toBeInTheDocument();
      expect(screen.getByText(description)).toBeInTheDocument();
    }
  });

  it('renders the step heading and hint', () => {
    renderStep();

    expect(screen.getByRole('heading', { name: 'Explora los módulos' })).toBeInTheDocument();
    expect(screen.getByText('No necesitas configurar nada más por ahora.')).toBeInTheDocument();
  });
});
