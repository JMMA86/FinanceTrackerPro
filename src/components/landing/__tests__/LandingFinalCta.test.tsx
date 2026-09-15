/**
 * LandingFinalCta tests — localized call to action block.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { LandingFinalCta } from '../LandingFinalCta';
import type { LandingCtaContent } from '../types';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children?: ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const cta: LandingCtaContent = {
  title: 'Toma el control exacto de tus finanzas',
  description: 'Crea tu cuenta gratis y comprueba cómo se sienten los números que cuadran.',
  primary: 'Crear cuenta gratis',
  secondary: 'Iniciar sesión',
};

describe('LandingFinalCta', () => {
  it('renderiza la sección accesible con título y descripción', () => {
    const { container } = render(<LandingFinalCta lang="es" cta={cta} />);

    const section = container.querySelector('section');
    expect(section).toHaveAttribute('aria-labelledby', 'final-cta-title');
    expect(screen.getByRole('heading', { level: 2, name: cta.title })).toHaveAttribute(
      'id',
      'final-cta-title'
    );
    expect(screen.getByText(cta.description)).toBeInTheDocument();
  });

  it('enlaza los CTA primario y secundario al locale', () => {
    render(<LandingFinalCta lang="es" cta={cta} />);

    expect(screen.getByRole('link', { name: cta.primary })).toHaveAttribute('href', '/es/register');
    expect(screen.getByRole('link', { name: cta.secondary })).toHaveAttribute('href', '/es/login');
  });

  it('localiza los CTA al idioma en', () => {
    render(<LandingFinalCta lang="en" cta={cta} />);

    expect(screen.getByRole('link', { name: cta.primary })).toHaveAttribute('href', '/en/register');
    expect(screen.getByRole('link', { name: cta.secondary })).toHaveAttribute('href', '/en/login');
  });
});
