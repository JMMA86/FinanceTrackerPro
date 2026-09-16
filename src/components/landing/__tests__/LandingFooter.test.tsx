/**
 * LandingFooter tests.
 *
 * `next/link`, `next/image` and `LanguageSelector` are mocked to focus on the
 * contentinfo landmark, the two labeled navigations and the localized hrefs.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { LandingFooter } from '../LandingFooter';
import type { LandingFooterContent, LandingNav } from '../types';

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

const footer: LandingFooterContent = {
  tagline: 'Gestión financiera personal con integridad de grado bancario.',
  product: 'Producto',
  account: 'Cuenta',
  rights: 'Todos los derechos reservados.',
};

const languageLabels = { es: 'Español', en: 'English' };
const ANCHORS = ['#features', '#benefits', '#security', '#faq'];

describe('LandingFooter', () => {
  it('expone el landmark contentinfo y el logo con aria-label del home', () => {
    render(<LandingFooter lang="es" nav={nav} footer={footer} languageLabels={languageLabels} />);

    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: nav.homeLabel })).toHaveAttribute('href', '/es');
    expect(screen.getByText(footer.tagline)).toBeInTheDocument();
  });

  it('renderiza la navegación de producto con los enlaces de ancla', () => {
    render(<LandingFooter lang="es" nav={nav} footer={footer} languageLabels={languageLabels} />);

    const productNav = screen.getByRole('navigation', { name: nav.productNavLabel });
    expect(screen.getByText(footer.product)).toBeInTheDocument();

    const hrefs = Array.from(productNav.querySelectorAll('a')).map((link) =>
      link.getAttribute('href')
    );
    expect(hrefs).toEqual(ANCHORS);
  });

  it('renderiza la navegación de cuenta con login y registro localizados', () => {
    render(<LandingFooter lang="en" nav={nav} footer={footer} languageLabels={languageLabels} />);

    const accountNav = screen.getByRole('navigation', { name: nav.accountNavLabel });
    expect(screen.getByText(footer.account)).toBeInTheDocument();

    const hrefs = Array.from(accountNav.querySelectorAll('a')).map((link) =>
      link.getAttribute('href')
    );
    expect(hrefs).toEqual(['/en/login', '/en/register']);
  });

  it('muestra el aviso de derechos con el año actual y el selector de idioma', () => {
    render(<LandingFooter lang="es" nav={nav} footer={footer} languageLabels={languageLabels} />);

    const year = new Date().getFullYear();
    expect(screen.getByText(new RegExp(`© ${year} FinanceTrackerPro`))).toBeInTheDocument();
    expect(screen.getByText(footer.rights, { exact: false })).toBeInTheDocument();
    expect(screen.getByTestId('language-selector')).toHaveTextContent('es');
  });
});
