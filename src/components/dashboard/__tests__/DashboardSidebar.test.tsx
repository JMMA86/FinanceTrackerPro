/**
 * DashboardSidebar Component Tests
 *
 * Covers the desktop sidebar layout:
 *  - Renders the app logo and the navigation links with localized labels.
 *  - Marks the active route with `aria-current="page"`.
 *  - Collapse/expand toggle persists to localStorage and flips a11y labels.
 *  - Logout calls the server action and redirects to the login route.
 *
 * `next/navigation`, `next/link`, `next/image` and the logout server action are
 * mocked so the test stays focused on the component's own behavior.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { DashboardSidebar } from '../DashboardSidebar';

const mockPush = vi.fn();
let mockPathname = '/es/dashboard';

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: mockPush }),
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

vi.mock('next/image', () => ({
  default: (props: { src: string; alt: string }) => (
    <div data-testid="mock-logo" data-src={props.src} data-alt={props.alt} />
  ),
}));

const mockLogoutAction = vi.fn();
vi.mock('@/actions/auth.actions', () => ({
  logoutAction: (...args: unknown[]) => mockLogoutAction(...args),
}));

const navigationLabels: Record<string, string> = {
  dashboard: 'Dashboard',
  transactions: 'Transactions',
  accounts: 'Accounts',
  savings: 'Savings',
  investments: 'Investments',
  settings: 'Settings',
  fixedExpenses: 'Fixed expenses',
  variableExpenses: 'Variable expenses',
  loans: 'Loans',
  dashboardDesc: 'Dashboard description',
};

function renderSidebar(overrides: Partial<ComponentProps<typeof DashboardSidebar>> = {}) {
  return render(
    <DashboardSidebar
      lang="es"
      navigationLabels={navigationLabels}
      logoutLabel="Log out"
      loggingOutLabel="Logging out"
      expandLabel="Expand sidebar"
      collapseLabel="Collapse sidebar"
      {...overrides}
    />
  );
}

describe('DashboardSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockPathname = '/es/dashboard';
    mockLogoutAction.mockResolvedValue(undefined);
  });

  it('renders the logo and localized navigation links', () => {
    renderSidebar();

    const logo = screen.getByTestId('mock-logo');
    expect(logo).toHaveAttribute('data-alt', 'FinanceTrackerPro');
    expect(logo).toHaveAttribute('data-src', '/icon.png');

    expect(screen.getByRole('link', { name: /Dashboard/ })).toHaveAttribute(
      'href',
      '/es/dashboard'
    );
    expect(screen.getByRole('link', { name: /Transactions/ })).toHaveAttribute(
      'href',
      '/es/transactions'
    );
    expect(screen.getByRole('link', { name: /Settings/ })).toBeInTheDocument();
  });

  it('marks the active route with aria-current="page"', () => {
    mockPathname = '/es/savings';
    renderSidebar();

    expect(screen.getByRole('link', { name: /Savings/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Dashboard/ })).not.toHaveAttribute('aria-current');
  });

  it('collapses and expands, persisting the preference to localStorage', () => {
    renderSidebar();

    const collapseButton = screen.getByRole('button', { name: 'Collapse sidebar' });
    expect(collapseButton).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(collapseButton);

    expect(localStorage.getItem('sidebar_collapsed')).toBe('true');
    const expandButton = screen.getByRole('button', { name: 'Expand sidebar' });
    expect(expandButton).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(expandButton);

    expect(localStorage.getItem('sidebar_collapsed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  it('restores the collapsed state persisted in localStorage', async () => {
    localStorage.setItem('sidebar_collapsed', 'true');
    renderSidebar();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Expand sidebar' })).toHaveAttribute(
        'aria-expanded',
        'false'
      );
    });
  });

  it('logs out and redirects to the login route', async () => {
    renderSidebar();

    fireEvent.click(screen.getByRole('button', { name: /Log out/ }));

    await waitFor(() => {
      expect(mockLogoutAction).toHaveBeenCalledWith('es');
    });
    expect(mockPush).toHaveBeenCalledWith('/es/login');
  });
});
