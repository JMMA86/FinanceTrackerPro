/**
 * LandingMobileNav tests.
 *
 * The component relies on the native `<details>` disclosure. jsdom implements
 * the summary toggle, so both the open and the close (via `onClick`) paths are
 * exercised for real.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { LandingMobileNav } from '../LandingMobileNav';
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

function renderNav(lang: 'es' | 'en' = 'es') {
  const view = render(<LandingMobileNav lang={lang} nav={nav} />);
  const details = view.container.querySelector('details');
  const summary = view.container.querySelector('summary');
  if (!details || !summary) {
    throw new Error('No se encontró el disclosure <details>/<summary>');
  }
  return { ...view, details, summary };
}

describe('LandingMobileNav', () => {
  it('renderiza el disclosure con las etiquetas ocultas de abrir/cerrar', () => {
    const { details } = renderNav();

    expect(details).toBeInTheDocument();
    expect(screen.getByText(nav.openMenu)).toBeInTheDocument();
    expect(screen.getByText(nav.closeMenu)).toBeInTheDocument();
  });

  it('abre el details al activar el summary', () => {
    const { details, summary } = renderNav();

    expect(details.open).toBe(false);
    fireEvent.click(summary);
    expect(details.open).toBe(true);
  });

  it('incluye los cuatro enlaces de ancla dentro de la navegación', () => {
    const { details } = renderNav();

    const navElement = screen.getByRole('navigation', { name: nav.mainNavLabel });
    const hrefs = Array.from(navElement.querySelectorAll('a')).map((link) =>
      link.getAttribute('href')
    );

    expect(hrefs).toEqual(['#features', '#benefits', '#security', '#faq']);
    expect(details).toContainElement(navElement);
  });

  it('enlaza el login al locale y localiza los hrefs al cambiar de idioma', () => {
    const { unmount } = renderNav('es');
    expect(screen.getByRole('link', { name: nav.login })).toHaveAttribute('href', '/es/login');
    unmount();

    renderNav('en');
    expect(screen.getByRole('link', { name: nav.login })).toHaveAttribute('href', '/en/login');
  });

  it('cierra el details al seleccionar un enlace de ancla', () => {
    const { details } = renderNav();

    details.open = true;
    fireEvent.click(screen.getByRole('link', { name: nav.features }));

    expect(details.open).toBe(false);
  });

  it('cierra el details al seleccionar el enlace de login', () => {
    const { details } = renderNav();

    details.open = true;
    fireEvent.click(screen.getByRole('link', { name: nav.login }));

    expect(details.open).toBe(false);
  });
});
