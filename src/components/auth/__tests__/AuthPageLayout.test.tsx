/**
 * AuthPageLayout Component Tests
 * Verifies the logo, app name, LanguageSelector and children rendering.
 * next/image and LanguageSelector are mocked to keep the test focused on the
 * layout composition.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AuthPageLayout from '../AuthPageLayout';

vi.mock('next/image', () => ({
  default: (props: {
    src: string;
    alt: string;
    width?: number;
    height?: number;
    className?: string;
  }) => (
    <div
      data-testid="mock-logo"
      data-src={props.src}
      data-alt={props.alt}
      data-width={props.width}
      data-height={props.height}
      data-class={props.className}
    />
  ),
}));

vi.mock('@/components/i18n/LanguageSelector', () => ({
  LanguageSelector: ({ currentLocale }: { currentLocale: string }) => (
    <div data-testid="language-selector">{currentLocale}</div>
  ),
}));

describe('AuthPageLayout', () => {
  const languageLabels = { es: 'Español', en: 'English' };

  it('renders the logo image and the app name', () => {
    render(
      <AuthPageLayout lang="es" languageLabels={languageLabels}>
        <div>contenido</div>
      </AuthPageLayout>
    );

    const logo = screen.getByTestId('mock-logo');
    expect(logo).toHaveAttribute('data-alt', 'FinanceTrackerPro');
    expect(logo).toHaveAttribute('data-src', '/icon.png');
    expect(screen.getByText('FinanceTrackerPro')).toBeInTheDocument();
  });

  it('renders the LanguageSelector with the current locale', () => {
    render(
      <AuthPageLayout lang="en" languageLabels={languageLabels}>
        <div>contenido</div>
      </AuthPageLayout>
    );

    expect(screen.getByTestId('language-selector')).toHaveTextContent('en');
  });

  it('renders its children', () => {
    render(
      <AuthPageLayout lang="es" languageLabels={languageLabels}>
        <main>contenido principal</main>
      </AuthPageLayout>
    );

    expect(screen.getByText('contenido principal')).toBeInTheDocument();
  });
});
