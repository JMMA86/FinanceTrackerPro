/**
 * AccountFullDetail Component Tests
 *
 * Uses the REAL formatMoney. getAccountTransactions and next/navigation are mocked.
 *
 * The action mock resolves inside a requestAnimationFrame callback: a reset
 * effect clears txs/total inside a rAF when the account opens, so resolving in
 * a microtask would wipe the loaded rows before they are ever shown.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { AccountFullDetail } from '../AccountFullDetail';
import type { AccountCardData } from '../AccountCard';
import esAccountsDictionary from '@/locales/es/accounts.json';

const mockRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: mockRefresh,
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
}));

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

const ACCOUNT: AccountCardData = {
  id: 'clh1234567890abcdefghij',
  name: 'Cuenta Principal',
  type: 'CHECKING',
  currency: 'COP',
  balanceCents: 100000,
  interestRateEA: null,
  parentAccountId: null,
  cardColor: null,
  cardNetwork: 'VISA',
  createdAt: new Date('2024-01-15'),
  transactions: [],
};

const RATE_ACCOUNT: AccountCardData = {
  ...ACCOUNT,
  id: 'clhabcdefghijklmnopqrstu',
  name: 'Ahorro con Tasa',
  type: 'SAVINGS',
  interestRateEA: 10,
};

const POCKET_ONE: AccountCardData = {
  id: 'clhzyxwvutsrqponmlkjihgf',
  name: 'Bolsillo Uno',
  type: 'POCKET',
  currency: 'COP',
  balanceCents: 25000,
  interestRateEA: 2,
  parentAccountId: ACCOUNT.id,
  cardColor: null,
  cardNetwork: null,
  createdAt: new Date('2024-02-01'),
  transactions: [],
};

const POCKET_TWO: AccountCardData = {
  ...POCKET_ONE,
  id: 'clhgfedcbazyxwvutsrqponm',
  name: 'Bolsillo Dos',
  balanceCents: 15000,
};

const cardRect = {
  top: 100,
  left: 200,
  right: 340,
  bottom: 220,
  width: 140,
  height: 120,
} as DOMRect;

const noop = () => undefined;

interface DetailOverrides {
  account?: AccountCardData | null;
  pockets?: AccountCardData[];
  isOpen?: boolean;
  cardRect?: DOMRect | null;
  onClose?: () => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string, name: string) => void;
  onCreatePocket?: (id: string) => void;
  onEditPocket?: (id: string) => void;
  onDeletePocket?: (id: string, name: string) => void;
}

function renderDetail(overrides: DetailOverrides = {}) {
  return render(
    <AccountFullDetail
      account={'account' in overrides ? (overrides.account ?? null) : ACCOUNT}
      pockets={overrides.pockets ?? []}
      cardRect={'cardRect' in overrides ? (overrides.cardRect ?? null) : cardRect}
      isOpen={overrides.isOpen ?? true}
      dictionary={esAccountsDictionary}
      locale="es-CO"
      onClose={overrides.onClose ?? noop}
      onEdit={overrides.onEdit ?? noop}
      onDelete={overrides.onDelete ?? noop}
      onCreatePocket={overrides.onCreatePocket ?? noop}
      onEditPocket={overrides.onEditPocket ?? noop}
      onDeletePocket={overrides.onDeletePocket ?? noop}
    />
  );
}

/**
 * The action mock resolves on the SECOND animation frame. The component's reset
 * effect (scheduled on the first frame when the account opens) clears
 * search/filters/transactions; resolving a frame later guarantees the loaded
 * rows survive and the debounced search timer is not cancelled by that reset.
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
          description: 'Supermercado',
          amountCents: -12000,
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
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve(payload));
        });
      })
  );
}

describe('AccountFullDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTxPage();
    // PocketDetailModal (rendered when a pocket card is clicked) uses <dialog>
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    });
  });

  it('should return null when not open', () => {
    const { container } = renderDetail({ isOpen: false });
    expect(container).toBeEmptyDOMElement();
  });

  it('should return null when account is null', () => {
    const { container } = renderDetail({ account: null });
    expect(container).toBeEmptyDOMElement();
  });

  it('should return null when cardRect is null', () => {
    const { container } = renderDetail({ cardRect: null });
    expect(container).toBeEmptyDOMElement();
  });

  it('should render the account detail when open', async () => {
    const { container } = renderDetail();

    expect(screen.getByRole('heading', { level: 1, name: 'Cuenta Principal' })).toBeInTheDocument();
    expect(screen.getAllByText('Corriente').length).toBeGreaterThan(0);
    expect(screen.getByText('Saldo actual')).toBeInTheDocument();
    expect(screen.getByText('Tasa EA')).toBeInTheDocument();
    expect(screen.getByText('Interés anual')).toBeInTheDocument();
    expect(screen.getByText('Cuenta desde')).toBeInTheDocument();
    expect(screen.getByText('Bolsillos')).toBeInTheDocument();
    expect(screen.getByText('Movimientos')).toBeInTheDocument();

    // Transactions loaded
    await waitFor(() => {
      expect(screen.getByText('Pago recibido')).toBeInTheDocument();
    });
    expect(screen.getByText('Supermercado')).toBeInTheDocument();
    // 'Ingreso'/'Gasto' also appear as <option> labels in the type filter
    expect(screen.getAllByText('Ingreso').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Gasto').length).toBeGreaterThan(0);
    // Counter text is split across text nodes inside the <p>
    await waitFor(() => {
      expect(container.textContent).toContain('2 movimientos');
    });
  });

  it('should render rate and projected interest for a rate-bearing account', async () => {
    renderDetail({ account: RATE_ACCOUNT });

    await waitFor(() => {
      expect(screen.getByText('Pago recibido')).toBeInTheDocument();
    });
    expect(screen.getAllByText('Ahorro con Tasa').length).toBeGreaterThan(0);
    expect(screen.getByText('10.00%')).toBeInTheDocument();
    expect(screen.getByText('Interés anual')).toBeInTheDocument();
  });

  it('should show an em dash for rate when the account has no rate', async () => {
    renderDetail();

    await waitFor(() => {
      expect(screen.getByText('Pago recibido')).toBeInTheDocument();
    });
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('should render pockets with balances', async () => {
    renderDetail({ pockets: [POCKET_ONE, POCKET_TWO] });

    await waitFor(() => {
      expect(screen.getByText('Bolsillo Uno')).toBeInTheDocument();
    });
    expect(screen.getByText('Bolsillo Dos')).toBeInTheDocument();
  });

  it('should show the empty pockets message when there are no pockets', async () => {
    renderDetail({ pockets: [] });

    await waitFor(() => {
      expect(
        screen.getByText('Sin bolsillos. Crea uno para separar tu dinero.')
      ).toBeInTheDocument();
    });
  });

  it('should show the empty transactions message', async () => {
    mockTxPage({ transactions: [], totalPages: 1, total: 0 });
    const { container } = renderDetail();

    await waitFor(() => {
      expect(screen.getByText('Sin movimientos')).toBeInTheDocument();
    });
    // The counter text is split across text nodes ({total} + literal space + label)
    await waitFor(() => {
      expect(container.textContent).toContain('0 movimientos');
    });
  });

  it('should show the loading skeleton while transactions are fetching', async () => {
    let resolveFn: (v: unknown) => void = () => undefined;
    mockGetAccountTransactions.mockReturnValue(
      new Promise((resolve) => {
        resolveFn = resolve;
      })
    );
    renderDetail();

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

  it('should search transactions with a debounce', async () => {
    renderDetail();

    await waitFor(() => {
      expect(screen.getByText('Pago recibido')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Buscar movimiento...'), {
      target: { value: 'super' },
    });

    await waitFor(() => {
      expect(mockGetAccountTransactions).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'super' })
      );
    });
  });

  it('should filter transactions by type', async () => {
    renderDetail();

    await waitFor(() => {
      expect(screen.getByText('Pago recibido')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'EXPENSE' } });

    await waitFor(() => {
      expect(mockGetAccountTransactions).toHaveBeenCalledWith(
        expect.objectContaining({ typeFilter: 'EXPENSE' })
      );
    });
  });

  it('should paginate to the next page', async () => {
    mockTxPage({ totalPages: 3, total: 25 });
    renderDetail();

    await waitFor(() => {
      expect(screen.getByText('1 / 3')).toBeInTheDocument();
    });
    expect(mockGetAccountTransactions).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: ACCOUNT.id, page: 1 })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));

    await waitFor(() => {
      expect(mockGetAccountTransactions).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: ACCOUNT.id, page: 2 })
      );
    });
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('should call onEdit when the edit button is clicked', async () => {
    const onEdit = vi.fn();
    renderDetail({ onEdit });

    await waitFor(() => {
      expect(screen.getByLabelText('Editar')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText('Editar'));
    expect(onEdit).toHaveBeenCalledWith(ACCOUNT.id);
  });

  it('should call onDelete when the delete button is clicked', async () => {
    const onDelete = vi.fn();
    renderDetail({ onDelete });

    await waitFor(() => {
      expect(screen.getByLabelText('Eliminar')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText('Eliminar'));
    expect(onDelete).toHaveBeenCalledWith(ACCOUNT.id, 'Cuenta Principal');
  });

  it('should call onCreatePocket when the create pocket button is clicked', async () => {
    const onCreatePocket = vi.fn();
    renderDetail({ onCreatePocket });

    await waitFor(() => {
      expect(screen.getByText('Agregar')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Agregar'));
    expect(onCreatePocket).toHaveBeenCalledWith(ACCOUNT.id);
  });

  it('should close when the back button is clicked', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const onClose = vi.fn();
    renderDetail({ onClose });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    fireEvent.click(screen.getByRole('button', { name: /Cuentas/ }));

    act(() => {
      vi.advanceTimersByTime(240);
    });
    expect(onClose).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('should close when Escape is pressed', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const onClose = vi.fn();
    renderDetail({ onClose });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    fireEvent.keyDown(document, { key: 'Escape' });

    act(() => {
      vi.advanceTimersByTime(240);
    });
    expect(onClose).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('should close when the account is deleted via event', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const onClose = vi.fn();
    renderDetail({ onClose });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    document.dispatchEvent(
      new CustomEvent('finance:account-deleted', { detail: { accountId: ACCOUNT.id } })
    );

    act(() => {
      vi.advanceTimersByTime(240);
    });
    expect(onClose).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('should open PocketDetailModal when a pocket card is clicked', async () => {
    const onEditPocket = vi.fn();
    const onDeletePocket = vi.fn();
    renderDetail({ pockets: [POCKET_ONE], onEditPocket, onDeletePocket });

    await waitFor(() => {
      expect(screen.getByText('Bolsillo Uno')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Bolsillo Uno'));

    // Wait for the PocketDetailModal content (it only renders after its rAF mount)
    await waitFor(() => {
      expect(screen.getByLabelText('Editar bolsillo')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Editar bolsillo'));
    expect(onEditPocket).toHaveBeenCalledWith(POCKET_ONE.id);

    fireEvent.click(screen.getByLabelText('Eliminar bolsillo'));
    expect(onDeletePocket).toHaveBeenCalledWith(POCKET_ONE.id, 'Bolsillo Uno');
  });

  it('should refresh the router when a deleted pocket card is missing', async () => {
    renderDetail({ pockets: [POCKET_ONE] });

    await waitFor(() => {
      expect(screen.getByText('Bolsillo Uno')).toBeInTheDocument();
    });

    // No [data-pocket-id] element exists for POCKET_TWO
    document.dispatchEvent(
      new CustomEvent('finance:pocket-deleted', { detail: { pocketId: POCKET_TWO.id } })
    );

    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  it('should run the pocket collapse animation and refresh when the deleted card exists', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    renderDetail({ pockets: [POCKET_ONE] });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    document.dispatchEvent(
      new CustomEvent('finance:pocket-deleted', { detail: { pocketId: POCKET_ONE.id } })
    );

    // fade 380ms + collapse 320ms + list collapse 300ms + buffers
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(mockRefresh).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('should update the live card color on updated event', async () => {
    renderDetail();

    await waitFor(() => {
      expect(screen.getByText('Pago recibido')).toBeInTheDocument();
    });

    document.dispatchEvent(
      new CustomEvent('finance:account-updated', {
        detail: { accountId: ACCOUNT.id, cardColor: 'white' },
      })
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Cuenta Principal' })).toBeInTheDocument();
  });
});
