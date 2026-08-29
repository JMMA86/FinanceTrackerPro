/**
 * PocketDetailModal Component Tests
 *
 * Uses the REAL formatMoney. getAccountTransactions is mocked.
 *
 * Mounting note: the component renders nothing until an internal rAF flips
 * `mounted`, and its showModal effect only fires when `pocket?.id` CHANGES
 * (the real app mounts it with null and then swaps in the pocket). Tests
 * therefore mount it as null, wait one frame, then swap in the pocket.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { PocketDetailModal } from '../PocketDetailModal';
import type { AccountCardData } from '../AccountCard';

const mockGetAccountTransactions = vi.fn();

vi.mock('@/actions/account-transactions.actions', () => ({
  getAccountTransactions: (...args: unknown[]) => mockGetAccountTransactions(...args),
}));

vi.mock('@/lib/logger', () => ({
  log: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  },
}));

const POCKET: AccountCardData = {
  id: 'clh1234567890abcdefghij',
  name: 'Bolsillo Viaje',
  type: 'POCKET',
  currency: 'COP',
  balanceCents: 1000000,
  interestRateEA: 5,
  parentAccountId: 'clhzyxwvutsrqponmlkjihgf',
  cardColor: null,
  cardNetwork: null,
  createdAt: new Date('2024-01-01'),
  transactions: [],
};

const RATE_FREE_POCKET: AccountCardData = {
  ...POCKET,
  id: 'clhabcdefghijklmnopqrstu',
  interestRateEA: 0,
};

interface PocketModalProps {
  onClose?: () => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string, name: string) => void;
}

const noop = () => undefined;

/**
 * Resolves the mocked action inside a requestAnimationFrame callback.
 *
 * The component has a reset effect that clears txs/total inside a rAF when the
 * pocket changes. If the action resolves in a microtask (mockResolvedValue),
 * the reset rAF runs AFTER and wipes the data — producing an empty list.
 * Resolving on a rAF (scheduled after the reset rAF) preserves the loaded rows.
 */
function mockTxPage(
  overrides: Partial<{ transactions: unknown[]; totalPages: number; total: number }> = {}
) {
  const payload = {
    success: true,
    data: {
      transactions: [
        {
          id: 'tx-1',
          description: 'Pago recibido',
          amountCents: 50000,
          currency: 'COP',
          type: 'INCOME',
          date: new Date('2024-05-01'),
        },
        {
          id: 'tx-2',
          description: 'Compra',
          amountCents: -20000,
          currency: 'COP',
          type: 'EXPENSE',
          date: new Date('2024-05-02'),
        },
      ],
      totalPages: 1,
      total: 2,
      ...overrides,
    },
  };
  mockGetAccountTransactions.mockImplementation(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => resolve(payload));
      })
  );
}

async function mountPocket(pocket: AccountCardData | null, props: PocketModalProps = {}) {
  const utils = render(
    <PocketDetailModal
      pocket={null}
      locale="es-CO"
      onClose={props.onClose ?? noop}
      onEdit={props.onEdit ?? noop}
      onDelete={props.onDelete ?? noop}
    />
  );
  // Wait until the internal mounted flag flips (one animation frame)
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  });
  if (pocket) {
    utils.rerender(
      <PocketDetailModal
        pocket={pocket}
        locale="es-CO"
        onClose={props.onClose ?? noop}
        onEdit={props.onEdit ?? noop}
        onDelete={props.onDelete ?? noop}
      />
    );
    // Flush the rAF scheduled by the showModal effect (it resets liveName/liveRate).
    // Without this, a later dispatched event can be overwritten by that reset.
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });
  }
  return utils;
}

describe('PocketDetailModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    });
  });

  it('should render null when pocket is null', async () => {
    const { container } = await mountPocket(null);
    expect(container).toBeEmptyDOMElement();
  });

  it('should render pocket name, balance and currency after mount', async () => {
    mockTxPage();
    await mountPocket(POCKET);

    await waitFor(() => {
      expect(screen.getByText('Bolsillo Viaje')).toBeInTheDocument();
    });
    expect(screen.getByText('Saldo actual')).toBeInTheDocument();
    expect(screen.getByText('COP')).toBeInTheDocument();
    expect(screen.getByText('Bolsillo')).toBeInTheDocument();
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled();
  });

  it('should show the profitability block when the rate is greater than zero', async () => {
    mockTxPage();
    await mountPocket(POCKET);

    await waitFor(() => {
      expect(screen.getByText('Rentabilidad')).toBeInTheDocument();
    });
    expect(screen.getByText('Tasa EA')).toBeInTheDocument();
    expect(screen.getByText('5.00%')).toBeInTheDocument();
    expect(screen.getByText('Ganancia')).toBeInTheDocument();
  });

  it('should hide the profitability block when the rate is zero', async () => {
    mockTxPage();
    await mountPocket(RATE_FREE_POCKET);

    await waitFor(() => {
      expect(screen.getByText('Movimientos')).toBeInTheDocument();
    });
    expect(screen.queryByText('Rentabilidad')).not.toBeInTheDocument();
  });

  it('should render transactions when loaded', async () => {
    mockTxPage();
    await mountPocket(POCKET);

    await waitFor(() => {
      expect(screen.getByText('Pago recibido')).toBeInTheDocument();
    });
    expect(screen.getByText('Compra')).toBeInTheDocument();
    expect(screen.getByText('Ingreso')).toBeInTheDocument();
    expect(screen.getByText('Gasto')).toBeInTheDocument();
    expect(screen.getByText('2 en total')).toBeInTheDocument();
  });

  it('should show the empty state when there are no transactions', async () => {
    mockTxPage({ transactions: [], totalPages: 1, total: 0 });
    await mountPocket(POCKET);

    await waitFor(() => {
      expect(screen.getByText('Sin movimientos registrados.')).toBeInTheDocument();
    });
  });

  it('should show the loading skeleton while fetching', async () => {
    let resolveFn: (v: unknown) => void = () => undefined;
    mockGetAccountTransactions.mockReturnValue(
      new Promise((resolve) => {
        resolveFn = resolve;
      })
    );

    await mountPocket(POCKET);

    await waitFor(() => {
      expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
    });

    await act(async () => {
      resolveFn({
        success: true,
        data: { transactions: [], totalPages: 1, total: 0 },
      });
    });
  });

  it('should render pagination controls and load the next page', async () => {
    mockTxPage({ totalPages: 3, total: 25 });
    await mountPocket(POCKET);

    await waitFor(() => {
      expect(screen.getByText('1 / 3')).toBeInTheDocument();
    });
    expect(mockGetAccountTransactions).toHaveBeenCalledWith({
      accountId: POCKET.id,
      page: 1,
    });

    // Next button is the last button inside the pagination bar
    const paginationButtons = document.querySelectorAll('div.justify-center button');
    const nextBtn = paginationButtons[paginationButtons.length - 1] as HTMLButtonElement;
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(mockGetAccountTransactions).toHaveBeenCalledWith({
        accountId: POCKET.id,
        page: 2,
      });
    });
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('should call onEdit with the pocket id', async () => {
    mockTxPage();
    const onEdit = vi.fn();
    await mountPocket(POCKET, { onEdit });

    await waitFor(() => {
      expect(screen.getByLabelText('Editar bolsillo')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText('Editar bolsillo'));
    expect(onEdit).toHaveBeenCalledWith(POCKET.id);
  });

  it('should call onDelete with the pocket id and name', async () => {
    mockTxPage();
    const onDelete = vi.fn();
    await mountPocket(POCKET, { onDelete });

    await waitFor(() => {
      expect(screen.getByLabelText('Eliminar bolsillo')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText('Eliminar bolsillo'));
    expect(onDelete).toHaveBeenCalledWith(POCKET.id, 'Bolsillo Viaje');
  });

  it('should call onClose when the dialog close event fires', async () => {
    mockTxPage();
    const onClose = vi.fn();
    const { container } = await mountPocket(POCKET, { onClose });

    await waitFor(() => {
      expect(screen.getByText('Bolsillo Viaje')).toBeInTheDocument();
    });
    const dialog = container.querySelector('dialog')!;
    act(() => {
      dialog.dispatchEvent(new Event('close'));
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('should close the dialog via the back button after the animation', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    mockTxPage();
    await mountPocket(POCKET);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    fireEvent.click(screen.getByLabelText('Volver'));

    act(() => {
      vi.advanceTimersByTime(260);
    });
    expect(HTMLDialogElement.prototype.close).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('should update the live name when an updated event matches the pocket', async () => {
    mockTxPage();
    await mountPocket(POCKET);

    await waitFor(() => {
      expect(screen.getByText('Bolsillo Viaje')).toBeInTheDocument();
    });

    document.dispatchEvent(
      new CustomEvent('finance:account-updated', {
        detail: { accountId: POCKET.id, name: 'Bolsillo Renombrado', interestRateEA: 7 },
      })
    );

    await waitFor(() => {
      expect(screen.getByText('Bolsillo Renombrado')).toBeInTheDocument();
    });
    expect(screen.getByText('7.00%')).toBeInTheDocument();
  });

  it('should ignore updated events for other pockets', async () => {
    mockTxPage();
    await mountPocket(POCKET);

    await waitFor(() => {
      expect(screen.getByText('Bolsillo Viaje')).toBeInTheDocument();
    });

    document.dispatchEvent(
      new CustomEvent('finance:account-updated', {
        detail: { accountId: 'clhotherpocketid123456', name: 'Otro' },
      })
    );

    expect(screen.getByText('Bolsillo Viaje')).toBeInTheDocument();
  });

  it('should close when the pocket is deleted via event', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    mockTxPage();
    await mountPocket(POCKET);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    document.dispatchEvent(
      new CustomEvent('finance:account-deleted', { detail: { accountId: POCKET.id } })
    );

    act(() => {
      vi.advanceTimersByTime(260);
    });
    expect(HTMLDialogElement.prototype.close).toHaveBeenCalled();
    vi.useRealTimers();
  });
});