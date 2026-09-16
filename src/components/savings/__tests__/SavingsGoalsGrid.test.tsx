/**
 * SavingsGoalsGrid Component Tests
 *
 * The grid is a client container whose initial state (goals) arrives from the
 * server page via props. After a mutation it calls `router.refresh()` so the
 * server re-runs the module. Children are mocked so we can assert wiring only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { SavingsGoalsGrid } from '../SavingsGoalsGrid';
import type { SavingsGoalWithProgress } from '@/types/savings';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const { mockRefresh } = vi.hoisted(() => ({ mockRefresh: vi.fn() }));

const makeGoal = (overrides: Partial<SavingsGoalWithProgress> = {}): SavingsGoalWithProgress => ({
  id: 'clh1234567890abcdefghij',
  userId: 'user-1',
  name: 'Vacaciones 2026',
  description: 'Ahorro para viaje',
  type: 'ANNUAL',
  targetAmountCents: 200000,
  currency: 'COP',
  currentAmountCents: 50000,
  deadline: null,
  monthlyContributionCents: 25000,
  linkedAccountId: null,
  linkedAccount: null,
  status: 'ACTIVE',
  priority: 0,
  color: null,
  icon: null,
  idempotencyKey: null,
  isActive: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  deletedAt: null,
  createdBy: 'user-1',
  lastModifiedBy: 'user-1',
  ipAddress: null,
  userAgent: null,
  progressPercentage: 25,
  projectedCompletion: null,
  contributions: [],
  ...overrides,
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const keyMap: Record<string, string> = {
      'errors.loadFailed': 'Error al cargar metas',
      retry: 'Reintentar',
      noGoals: 'No hay metas',
      noGoalsDesc: 'Crea tu primera meta de ahorro',
      addGoal: 'Agregar meta',
      goal: 'meta',
      goals: 'metas',
    };
    return keyMap[key] ?? key;
  }),
}));

vi.mock('../SavingsGoalCard', () => ({
  SavingsGoalCard: vi.fn(
    (_props: {
      goal: SavingsGoalWithProgress;
      dictionary: Record<string, unknown>;
      locale: string;
      onContribute: (goalId: string) => void;
      onEdit: (goal: SavingsGoalWithProgress) => void;
      onDelete: (goalId: string, goalName: string, hasContributions: boolean) => void;
    }) => <article data-testid="goal-card" />
  ),
}));

vi.mock('../CreateSavingsGoalModal', () => ({
  CreateSavingsGoalModal: vi.fn(
    (_props: {
      dictionary: Record<string, unknown>;
      locale: string;
      isOpen: boolean;
      onClose: () => void;
    }) => <div data-testid="create-modal" />
  ),
}));

vi.mock('../EditSavingsGoalModal', () => ({
  EditSavingsGoalModal: vi.fn(
    (_props: {
      goal: SavingsGoalWithProgress;
      dictionary: Record<string, unknown>;
      locale: string;
      isOpen: boolean;
      onClose: () => void;
    }) => <div data-testid="edit-modal" />
  ),
}));

vi.mock('../ContributeModal', () => ({
  ContributeModal: vi.fn(
    (_props: {
      goalId: string;
      dictionary: Record<string, unknown>;
      locale: string;
      isOpen: boolean;
      onClose: () => void;
    }) => <div data-testid="contribute-modal" />
  ),
}));

vi.mock('../DeleteGoalModal', () => ({
  DeleteGoalModal: vi.fn(
    (_props: {
      goalId: string;
      goalName: string;
      hasContributions: boolean;
      dictionary: Record<string, unknown>;
      isOpen: boolean;
      onClose: () => void;
    }) => <div data-testid="delete-modal" />
  ),
}));

import { SavingsGoalCard } from '../SavingsGoalCard';
import { CreateSavingsGoalModal } from '../CreateSavingsGoalModal';
import { EditSavingsGoalModal } from '../EditSavingsGoalModal';
import { ContributeModal } from '../ContributeModal';
import { DeleteGoalModal } from '../DeleteGoalModal';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SavingsGoalsGrid', () => {
  const defaultDictionary = {};

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderGrid = (goals: SavingsGoalWithProgress[], loadError: string | null = null) =>
    render(
      <SavingsGoalsGrid
        goals={goals}
        loadError={loadError}
        dictionary={defaultDictionary}
        locale="es-CO"
      />
    );

  it('should show the empty state with an add-goal button', () => {
    renderGrid([]);

    expect(screen.getByText('No hay metas')).toBeInTheDocument();
    expect(screen.getByText('Agregar meta')).toBeInTheDocument();
  });

  it('should show the goal count header and cards when goals exist', () => {
    renderGrid([
      makeGoal(),
      makeGoal({ id: 'clh99999999999999999999', name: 'Fondo de Emergencia' }),
    ]);

    expect(screen.getByText('2 metas')).toBeInTheDocument();
    expect(screen.getAllByTestId('goal-card')).toHaveLength(2);
  });

  it('should use singular "meta" when there is exactly one goal', () => {
    renderGrid([makeGoal()]);

    expect(screen.getByText('1 meta')).toBeInTheDocument();
  });

  it('should show the error alert with a retry button when loadError is set', () => {
    renderGrid([], 'Error al cargar metas');

    expect(screen.getByRole('alert')).toHaveTextContent('Error al cargar metas');
    expect(screen.getByText('Reintentar')).toBeInTheDocument();
  });

  it('should open the CreateSavingsGoalModal when add-goal is clicked', () => {
    renderGrid([makeGoal()]);

    fireEvent.click(screen.getByText('Agregar meta'));

    const calls = vi.mocked(CreateSavingsGoalModal).mock.calls;
    expect(calls[calls.length - 1][0].isOpen).toBe(true);
  });

  it('should open EditSavingsGoalModal when a goal is edited', () => {
    const goal = makeGoal();
    renderGrid([goal]);

    const cardProps = vi.mocked(SavingsGoalCard).mock.calls[0][0];
    act(() => {
      cardProps.onEdit(goal);
    });

    const calls = vi.mocked(EditSavingsGoalModal).mock.calls;
    expect(calls[calls.length - 1][0].isOpen).toBe(true);
    expect(calls[calls.length - 1][0].goal).toEqual(goal);
  });

  it('should open ContributeModal with the goal id when contributing', () => {
    const goal = makeGoal();
    renderGrid([goal]);

    const cardProps = vi.mocked(SavingsGoalCard).mock.calls[0][0];
    act(() => {
      cardProps.onContribute(goal.id);
    });

    const calls = vi.mocked(ContributeModal).mock.calls;
    expect(calls[calls.length - 1][0].goalId).toBe(goal.id);
    expect(calls[calls.length - 1][0].isOpen).toBe(true);
  });

  it('should open DeleteGoalModal with goal metadata when deleting', () => {
    const goal = makeGoal();
    renderGrid([goal]);

    const cardProps = vi.mocked(SavingsGoalCard).mock.calls[0][0];
    act(() => {
      cardProps.onDelete(goal.id, goal.name, true);
    });

    const calls = vi.mocked(DeleteGoalModal).mock.calls;
    expect(calls[calls.length - 1][0].goalId).toBe(goal.id);
    expect(calls[calls.length - 1][0].goalName).toBe('Vacaciones 2026');
    expect(calls[calls.length - 1][0].hasContributions).toBe(true);
    expect(calls[calls.length - 1][0].isOpen).toBe(true);
  });

  it('should refresh server data when a modal is closed', async () => {
    const goal = makeGoal();
    renderGrid([goal]);

    const cardProps = vi.mocked(SavingsGoalCard).mock.calls[0][0];
    act(() => {
      cardProps.onDelete(goal.id, goal.name, false);
    });

    await waitFor(() => {
      const calls = vi.mocked(DeleteGoalModal).mock.calls;
      expect(calls[calls.length - 1][0].isOpen).toBe(true);
    });

    const deleteProps = vi.mocked(DeleteGoalModal).mock.calls.at(-1)![0];
    act(() => {
      deleteProps.onClose();
    });

    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  it('should refresh server data when the create modal closes in a NON-empty state', async () => {
    const goal = makeGoal();
    renderGrid([goal]);

    fireEvent.click(screen.getByText('Agregar meta'));

    const calls = vi.mocked(CreateSavingsGoalModal).mock.calls;
    await waitFor(() => {
      expect(calls.at(-1)![0].isOpen).toBe(true);
    });

    act(() => {
      calls.at(-1)![0].onClose();
    });

    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  it('should refresh server data when the edit modal closes in a NON-empty state', async () => {
    const goal = makeGoal();
    renderGrid([goal]);

    const cardProps = vi.mocked(SavingsGoalCard).mock.calls[0][0];
    act(() => {
      cardProps.onEdit(goal);
    });

    const calls = vi.mocked(EditSavingsGoalModal).mock.calls;
    await waitFor(() => {
      expect(calls.at(-1)![0].isOpen).toBe(true);
    });

    act(() => {
      calls.at(-1)![0].onClose();
    });

    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  it('should refresh server data when the contribute modal closes in a NON-empty state', async () => {
    const goal = makeGoal();
    renderGrid([goal]);

    const cardProps = vi.mocked(SavingsGoalCard).mock.calls[0][0];
    act(() => {
      cardProps.onContribute(goal.id);
    });

    const calls = vi.mocked(ContributeModal).mock.calls;
    await waitFor(() => {
      expect(calls.at(-1)![0].isOpen).toBe(true);
    });

    act(() => {
      calls.at(-1)![0].onClose();
    });

    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalled();
    });
  });
});
