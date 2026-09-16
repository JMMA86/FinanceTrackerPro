/**
 * VariableExpensesView Component Tests — client orchestrator: header, month
 * navigation, and the modal open/close wiring around the mocked children.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VariableExpensesView } from '../VariableExpensesView';
import type {
  VariableExpenseDefinition,
  VariableExpensesOverviewResponse,
} from '@/types/variable-expense';

const { routerPush, routerRefresh } = vi.hoisted(() => ({
  routerPush: vi.fn(),
  routerRefresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, refresh: routerRefresh }),
}));

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const keyMap: Record<string, string> = {
      title: 'Gastos Variables',
      subtitle: 'Monitorea tus gastos',
      previousMonth: 'Mes anterior',
      nextMonth: 'Mes siguiente',
      newDefinition: 'Nueva definición',
      registerExpense: 'Registrar gasto',
    };
    return keyMap[key] ?? key;
  }),
}));

interface ListProps {
  definitions: VariableExpenseDefinition[];
  onRegister: (definition: VariableExpenseDefinition) => void;
  onOpenDetail: (definition: VariableExpenseDefinition) => void;
  onEdit: (definition: VariableExpenseDefinition) => void;
  onDelete: (definition: VariableExpenseDefinition) => void;
}

vi.mock('../VariableExpensesOverviewCards', () => ({
  VariableExpensesOverviewCards: () => <div data-testid="overview-cards" />,
}));

vi.mock('../VariableExpenseDefinitionList', () => ({
  VariableExpenseDefinitionList: ({
    definitions,
    onRegister,
    onOpenDetail,
    onEdit,
    onDelete,
  }: ListProps) => (
    <div data-testid="definition-list">
      <button type="button" onClick={() => onRegister(definitions[0])}>
        open-register
      </button>
      <button type="button" onClick={() => onOpenDetail(definitions[0])}>
        open-detail
      </button>
      <button type="button" onClick={() => onEdit(definitions[0])}>
        open-edit
      </button>
      <button type="button" onClick={() => onDelete(definitions[0])}>
        open-delete
      </button>
    </div>
  ),
}));

vi.mock('../VariableExpenseDefinitionModal', () => ({
  VariableExpenseDefinitionModal: ({
    isOpen,
    definition,
  }: {
    isOpen: boolean;
    definition: VariableExpenseDefinition | null;
  }) => (isOpen ? <div data-testid="definition-modal">{definition?.name ?? 'create'}</div> : null),
}));

vi.mock('../RegisterVariableExpenseModal', () => ({
  RegisterVariableExpenseModal: ({
    isOpen,
    definition,
  }: {
    isOpen: boolean;
    definition: VariableExpenseDefinition | null;
  }) => (isOpen ? <div data-testid="register-modal">{definition?.name ?? 'select'}</div> : null),
}));

vi.mock('../DeleteVariableExpenseModal', () => ({
  DeleteVariableExpenseModal: ({ definition }: { definition: VariableExpenseDefinition }) => (
    <div data-testid="delete-modal">{definition.name}</div>
  ),
}));

vi.mock('../VariableExpenseDetail', () => ({
  VariableExpenseDetail: ({ definition }: { definition: VariableExpenseDefinition }) => (
    <div data-testid="detail-modal">{definition.name}</div>
  ),
}));

const definition: VariableExpenseDefinition = {
  id: 'def-1',
  name: 'Fútbol',
  description: null,
  color: null,
  icon: null,
  categoryId: null,
  category: null,
  expectedTimesPerMonth: null,
  expectedAmountCents: null,
  currency: 'COP',
  isActive: true,
};

const overview: VariableExpensesOverviewResponse = {
  month: 9,
  year: 2026,
  byCurrency: [],
};

function renderView(definitions: VariableExpenseDefinition[] = [definition]) {
  return render(
    <VariableExpensesView
      month={9}
      year={2026}
      locale="es-CO"
      dictionary={{}}
      transactionsDictionary={{}}
      overview={overview}
      definitions={definitions}
      overviewError={null}
      definitionsError={null}
    />
  );
}

describe('VariableExpensesView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the header and the overview cards', () => {
    renderView();

    expect(screen.getByRole('heading', { level: 1, name: 'Gastos Variables' })).toBeInTheDocument();
    expect(screen.getByText('Monitorea tus gastos')).toBeInTheDocument();
    expect(screen.getByTestId('overview-cards')).toBeInTheDocument();
  });

  it('opens the create-definition modal from the header', () => {
    renderView();

    fireEvent.click(screen.getByText('Nueva definición'));

    expect(screen.getByTestId('definition-modal')).toHaveTextContent('create');
  });

  it('disables the "register" header button without definitions and opens the selector with them', () => {
    renderView([]);
    expect(screen.getByText('Registrar gasto')).toBeDisabled();

    renderView([definition]);
    fireEvent.click(screen.getAllByText('Registrar gasto')[1]);

    expect(screen.getByTestId('register-modal')).toHaveTextContent('select');
  });

  it('opens the register/detail/edit/delete modals from the list callbacks', () => {
    renderView();

    fireEvent.click(screen.getByText('open-register'));
    expect(screen.getByTestId('register-modal')).toHaveTextContent('Fútbol');
    fireEvent.click(screen.getByText('open-detail'));
    expect(screen.getByTestId('detail-modal')).toHaveTextContent('Fútbol');
    fireEvent.click(screen.getByText('open-edit'));
    expect(screen.getByTestId('definition-modal')).toHaveTextContent('Fútbol');
    fireEvent.click(screen.getByText('open-delete'));
    expect(screen.getByTestId('delete-modal')).toHaveTextContent('Fútbol');
  });

  it('navigates months via the router', () => {
    renderView();

    fireEvent.click(screen.getByLabelText('Mes anterior'));
    expect(routerPush).toHaveBeenCalledWith('?month=8&year=2026');

    fireEvent.click(screen.getByLabelText('Mes siguiente'));
    expect(routerPush).toHaveBeenCalledWith('?month=10&year=2026');
  });
});
