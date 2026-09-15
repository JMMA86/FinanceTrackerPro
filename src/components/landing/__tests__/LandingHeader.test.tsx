/**
 * LandingHeader tests.
 *
 * `next/link`, `next/image` and `LanguageSelector` are mocked so the assertions
 * stay focused on land­marks, localized hrefs and the anchor navigation.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { LandingHeader } from '../LandingHeader';
import type { LandingNav } from '../types';

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
    <div data-testid="mock-logo" data-src={src} data-alt={alt} />
  ),
}));

vi.mock('@/components/i18n/LanguageSelector', () => ({
  LanguageSelector: ({ currentLocale }: { currentLocale: string }) => (
    <div data-testid="language-selector">{currentLocale}</div>
  ),
}));

const nav: LandingNav = {
  features: 'Módulos',
  benefits: 'Beneficios',
  security: 'Seguridad',
  faq: 'Preguntas',
  login: 'Iniciar sesión',
  register: 'Crear cuenta',
  openMenu: 'Abrir menú de navegación',
  closeMenu: 'Cerrar menú de navegación',
  mainNavLabel: 'Navegación principal',
  productNavLabel: 'Navegación del producto',
  accountNavLabel: 'Navegación de cuenta',
  homeLabel: 'FinanceTrackerPro — Inicio',
};

const languageLabels = { es: 'Español', en: 'English' };
const ANCHORS = ['#features', '#benefits', '#security', '#faq'];

describe('LandingHeader', () => {
  it('expone el landmark banner y la navegación principal', () => {
    render(<LandingHeader lang="es" nav={nav} languageLabels={languageLabels} />);

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(
      screen.getAllByRole('navigation', { name: nav.mainNavLabel }).length
    ).toBeGreaterThanOrEqual(1);
  });

  it('renderiza el logo con aria-label del home apuntando al locale', () => {
    render(<LandingHeader lang="es" nav={nav} languageLabels={languageLabels} />);

    expect(screen.getByRole('link', { name: nav.homeLabel })).toHaveAttribute('href', '/es');
    expect(screen.getByTestId('mock-logo')).toHaveAttribute('data-src', '/icon.png');
    expect(screen.getByTestId('mock-logo')).toHaveAttribute('data-alt', '');
  });

  it('incluye los cuatro enlaces de ancla', () => {
    render(<LandingHeader lang="es" nav={nav} languageLabels={languageLabels} />);

    const hashLinks = screen
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'))
      .filter((href): href is string => href?.startsWith('#') ?? false);

    for (const anchor of ANCHORS) {
      expect(hashLinks).toContain(anchor);
    }
    // Desktop nav (4) + mobile nav (4).
    expect(hashLinks).toHaveLength(8);
  });

  it('enlaza el CTA de registro y el login al locale activo', () => {
    render(<LandingHeader lang="es" nav={nav} languageLabels={languageLabels} />);

    expect(screen.getByRole('link', { name: nav.register })).toHaveAttribute(
      'href',
      '/es/register'
    );

    const loginLinks = screen.getAllByRole('link', { name: nav.login });
    expect(loginLinks.length).toBeGreaterThanOrEqual(1);
    for (const link of loginLinks) {
      expect(link).toHaveAttribute('href', '/es/login');
    }
  });

  it('localiza los enlaces al idioma en', () => {
    render(<LandingHeader lang="en" nav={nav} languageLabels={languageLabels} />);

    expect(screen.getByRole('link', { name: nav.homeLabel })).toHaveAttribute('href', '/en');
    expect(screen.getByRole('link', { name: nav.register })).toHaveAttribute(
      'href',
      '/en/register'
    );
  });

  it('renderiza el selector de idioma con el locale actual', () => {
    render(<LandingHeader lang="en" nav={nav} languageLabels={languageLabels} />);

    expect(screen.getByTestId('language-selector')).toHaveTextContent('en');
  });
});
