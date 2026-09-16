/**
 * LandingHero tests.
 *
 * `next/link` and `next/image` are mocked. `AnimatedBackground` is left real so
 * the full composition is rendered.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { LandingHero } from '../LandingHero';
import type { LandingHeroContent } from '../types';

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

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <div data-testid="mock-image" data-src={src} data-alt={alt} />
  ),
}));

function makeHero(): LandingHeroContent {
  return {
    badge: 'Integridad financiera de grado bancario',
    titleLead: 'Tus finanzas,',
    titleHighlight: 'exactas al centavo',
    subtitle: 'Un solo panel para todo tu dinero.',
    ctaPrimary: 'Crear cuenta gratis',
    ctaSecondary: 'Iniciar sesión',
    trustLabel: 'Diseñado para la exactitud',
    trust: ['Precisión Decimal.js', 'Transacciones atómicas ACID', 'Multi-divisa ISO 4217'],
    preview: {
      ariaLabel: 'Vista previa del panel con balance disponible y cuentas principales.',
      title: 'Resumen del patrimonio',
      balanceLabel: 'Balance disponible',
      balanceValue: '$52.480.536,35',
      trend: '+4,8% este mes',
      chartLabel: 'Flujo de los últimos 8 días',
      accountsLabel: 'Cuentas principales',
      accounts: [
        { name: 'Cuenta corriente', value: '$858.240,00', delta: '+2,1%', tone: 'positive' },
        { name: 'Inversiones', value: '$11.120,00', delta: '-3,2%', tone: 'negative' },
      ],
    },
  };
}

describe('LandingHero', () => {
  it('renderiza un único h1 con el badge', () => {
    const hero = makeHero();
    render(<LandingHero lang="es" hero={hero} />);

    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(hero.titleLead);
    expect(headings[0]).toHaveTextContent(hero.titleHighlight);
    expect(screen.getByText(hero.badge)).toBeInTheDocument();
  });

  it('enlaza el CTA primario y secundario a los hrefs del locale', () => {
    const hero = makeHero();
    render(<LandingHero lang="es" hero={hero} />);

    expect(screen.getByRole('link', { name: hero.ctaPrimary })).toHaveAttribute(
      'href',
      '/es/register'
    );
    expect(screen.getByRole('link', { name: hero.ctaSecondary })).toHaveAttribute(
      'href',
      '/es/login'
    );
  });

  it('localiza los CTA al idioma en', () => {
    const hero = makeHero();
    render(<LandingHero lang="en" hero={hero} />);

    expect(screen.getByRole('link', { name: hero.ctaPrimary })).toHaveAttribute(
      'href',
      '/en/register'
    );
    expect(screen.getByRole('link', { name: hero.ctaSecondary })).toHaveAttribute(
      'href',
      '/en/login'
    );
  });

  it('lista el label de confianza y cada elemento de trust', () => {
    const hero = makeHero();
    render(<LandingHero lang="es" hero={hero} />);

    expect(screen.getByText(hero.trustLabel)).toBeInTheDocument();
    for (const item of hero.trust) {
      expect(screen.getByText(item)).toBeInTheDocument();
    }
  });

  it('marca la preview como decorativa y expone una figcaption accesible', () => {
    const hero = makeHero();
    const { container } = render(<LandingHero lang="es" hero={hero} />);

    const figure = container.querySelector('figure');
    expect(figure).not.toBeNull();
    // The visual mock is hidden from assistive tech...
    expect(figure?.querySelector('[aria-hidden="true"]')).not.toBeNull();
    // ...while the figcaption carries the description of the preview.
    const figcaption = figure?.querySelector('figcaption');
    expect(figcaption).toHaveTextContent(hero.preview.ariaLabel);
  });

  it('renderiza los datos de la preview y distingue el tono negativo', () => {
    const hero = makeHero();
    render(<LandingHero lang="es" hero={hero} />);

    expect(screen.getByText(hero.preview.balanceValue)).toBeInTheDocument();
    expect(screen.getByText(hero.preview.trend)).toBeInTheDocument();
    expect(screen.getByText(hero.preview.accountsLabel)).toBeInTheDocument();

    for (const account of hero.preview.accounts) {
      expect(screen.getByText(account.name)).toBeInTheDocument();
      expect(screen.getByText(account.value)).toBeInTheDocument();
      expect(screen.getByText(account.delta)).toBeInTheDocument();
    }

    expect(screen.getByText('-3,2%')).toHaveClass('text-rose-300');
    expect(screen.getByText('+2,1%')).toHaveClass('text-emerald-300');
  });
});
