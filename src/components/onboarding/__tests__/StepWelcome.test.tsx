/**
 * StepWelcome tests: greeting interpolation, language radios with the persisted
 * selection, the saving/disabled state and the localized error alert.
 */

import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { StepWelcome } from '../StepWelcome';
import esOnboarding from '@/locales/es/onboarding.json';
import esCommon from '@/locales/es/common.json';

const onboarding = esOnboarding as Record<string, unknown>;
const common = esCommon as Record<string, unknown>;

function renderWelcome(overrides: Partial<Parameters<typeof StepWelcome>[0]> = {}) {
  const onLanguageChange = vi.fn();
  const props = {
    headingRef: createRef<HTMLHeadingElement>(),
    titleId: 'onboarding-step-heading',
    dictionary: onboarding,
    common,
    userName: 'Ana',
    currentLocale: 'es' as const,
    onLanguageChange,
    isSaving: false,
    error: null,
    ...overrides,
  };
  const { container } = render(<StepWelcome {...props} />);
  return { onLanguageChange, container };
}

describe('StepWelcome', () => {
  it('renders the greeting with the user name interpolated', () => {
    renderWelcome({ userName: 'Ana' });

    expect(screen.getByRole('heading', { name: '¡Te damos la bienvenida!' })).toBeInTheDocument();
    expect(screen.getByText('¡Hola, Ana!')).toBeInTheDocument();
  });

  it('renders both language radios with the current locale selected', () => {
    renderWelcome({ currentLocale: 'en' });
    const radios = screen.getAllByRole('radio');

    expect(radios).toHaveLength(2);
    expect(screen.getByRole('radio', { name: 'Español' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'English' })).toBeChecked();
  });

  it('exposes the language labels from the common dictionary', () => {
    renderWelcome();

    expect(screen.getByText('Español')).toBeInTheDocument();
    expect(screen.getByText('English')).toBeInTheDocument();
  });

  it('calls onLanguageChange when another language is selected', () => {
    const { onLanguageChange } = renderWelcome({ currentLocale: 'es' });

    fireEvent.click(screen.getByRole('radio', { name: 'English' }));

    expect(onLanguageChange).toHaveBeenCalledWith('en');
  });

  it('disables the fieldset and flags aria-busy while saving', () => {
    const { container } = renderWelcome({ isSaving: true });
    const fieldset = container.querySelector('fieldset');

    expect(fieldset).toBeDisabled();
    expect(fieldset).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('radio', { name: 'Español' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'English' })).toBeDisabled();
  });

  it('shows the language update error with role="alert"', () => {
    renderWelcome({ error: 'No se pudo actualizar el idioma.' });

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo actualizar el idioma.');
  });

  it('does not render an alert when there is no error', () => {
    renderWelcome({ error: null });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
