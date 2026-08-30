/**
 * ToastViewport Component Tests
 *
 * Verifies the global notification renderer: aria-live region, per-type
 * styling, stacked rendering, and manual dismissal via the close button.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastViewport } from '../ToastViewport';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRemoveNotification = vi.fn();
let mockNotifications: Array<{
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  timestamp: number;
}> = [];

vi.mock('@/store/ui.store', () => ({
  useUIStore: vi.fn((selector) => {
    const state = {
      notifications: mockNotifications,
      removeNotification: mockRemoveNotification,
    };
    return selector(state);
  }),
}));

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

function notification(
  overrides: Partial<{
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    message: string;
    timestamp: number;
  }> = {}
) {
  return {
    id: 'notif-1',
    type: 'success' as const,
    message: 'Transacción creada exitosamente',
    timestamp: 1_700_000_000_000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ToastViewport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNotifications = [];
  });

  it('should always render an aria-live polite region', () => {
    render(<ToastViewport />);

    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
  });

  it('should render no toasts when the store is empty', () => {
    render(<ToastViewport />);

    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('should render a success notification with its message', () => {
    mockNotifications = [notification()];

    render(<ToastViewport />);

    expect(screen.getByText('Transacción creada exitosamente')).toBeInTheDocument();
  });

  it.each([
    ['success', 'bg-emerald-500/10'],
    ['error', 'bg-rose-500/10'],
    ['warning', 'bg-amber-500/10'],
    ['info', 'bg-blue-500/10'],
  ] as const)('should apply the %s type styles', (type, expectedClass) => {
    mockNotifications = [notification({ type })];

    render(<ToastViewport />);

    // The <p> message is a direct child of the toast container
    expect(screen.getByText('Transacción creada exitosamente').parentElement).toHaveClass(
      expectedClass
    );
  });

  it('should render multiple notifications stacked', () => {
    mockNotifications = [
      notification({ id: 'notif-1', message: 'Primera notificación' }),
      notification({ id: 'notif-2', message: 'Segunda notificación' }),
    ];

    render(<ToastViewport />);

    expect(screen.getByText('Primera notificación')).toBeInTheDocument();
    expect(screen.getByText('Segunda notificación')).toBeInTheDocument();
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('should dismiss a notification via its accessible close button', async () => {
    mockNotifications = [notification({ id: 'notif-42' })];
    const user = userEvent.setup();

    render(<ToastViewport />);

    await user.click(screen.getByRole('button', { name: 'Cerrar notificación' }));

    await waitFor(() => {
      expect(mockRemoveNotification).toHaveBeenCalledWith('notif-42');
    });
  });

  it('should provide a close button per rendered notification', () => {
    mockNotifications = [notification({ id: 'notif-1' }), notification({ id: 'notif-2' })];

    render(<ToastViewport />);

    expect(screen.getAllByRole('button', { name: 'Cerrar notificación' })).toHaveLength(2);
  });
});
