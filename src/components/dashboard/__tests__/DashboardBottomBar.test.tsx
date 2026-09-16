/**
 * DashboardBottomBar Component Tests
 *
 * Covers the mobile bottom navigation:
 *  - Renders only the mobile navigation items.
 *  - Marks the active route with `aria-current="page"`.
 *  - Falls back to the i18n key when a localized label is missing.
 *
 * `next/navigation` and `next/link` are mocked so the test stays focused on the
 * component's own behavior.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { DashboardBottomBar } from '../DashboardBottomBar';
import { mobileNavigationItems } from '@/config/navigation';

let mockPathname = '/es/dashboard';

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

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

const navigationLabels: Record<string, string> = {
  dashboard: 'Dashboard',
  transactions: 'Transactions',
  accounts: 'Accounts',
  savings: 'Savings',
  investments: 'Investments',
  settings: 'Settings',
};

describe('DashboardBottomBar', () => {
  beforeEach(() => {
    mockPathname = '/es/dashboard';
  });

  it('renders exactly the mobile navigation items', () => {
    render(<DashboardBottomBar lang="es" navigationLabels={navigationLabels} />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(mobileNavigationItems.length);
    expect(links.map((l) => l.getAttribute('href'))).toEqual(
      mobileNavigationItems.map((item) => `/es${item.href}`)
    );
  });

  it('marks the active route with aria-current="page"', () => {
    mockPathname = '/es/investments';
    render(<DashboardBottomBar lang="es" navigationLabels={navigationLabels} />);

    expect(screen.getByRole('link', { name: /Investments/ })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('link', { name: /Dashboard/ })).not.toHaveAttribute('aria-current');
  });

  it('falls back to the i18n key when a label is missing', () => {
    render(<DashboardBottomBar lang="es" navigationLabels={{}} />);

    expect(screen.getByText('dashboard')).toBeInTheDocument();
    expect(screen.getByText('transactions')).toBeInTheDocument();
  });
});
