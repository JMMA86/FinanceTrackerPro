/**
 * SavingsGoalsGrid Component Tests
 *
 * The grid is a client container that loads goals via getSavingsGoals and
 * manages modal state. Children are mocked so we can assert wiring only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { SavingsGoalsGrid } from '../SavingsGoalsGrid';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface GoalFixture {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  type: string;
  targetAmountCents: number;
  currency: string;
  currentAmountCents: number;
  deadline: Date | null;
  monthlyContributionCents: number | null;
  linkedAccountId: string | null;
  linkedAccount: { id: string; name: string; currency: string } | null;
  status: string;
  priority: number;
  color: string | null;
  icon: string | null;
  idempotencyKey: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  createdBy: string | null;
  lastModifiedBy: string | null;
  progressPercentage: number;
  projectedCompletion: string | null;
  contributions: unknown[];
}

const makeGoal = (overrides: Partial<GoalFixture> = {}): GoalFixture => ({
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
  progressPercentage: 25,
  projectedCompletion: null,
  contributions: [],
  ...overrides,
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetSavingsGoals = vi.fn();

vi.mock('@/actions/savings.actions', () => ({
  getSavingsGoals: (...args: unknown[]) => mockGetSavingsGoals(...args),
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
      goal: GoalFixture;
      dictionary: Record<string, unknown>;
      locale: string;
      onContribute: (goalId: string) => void;
      onEdit: (goal: GoalFixture) => void;
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
      goal: GoalFixture;
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
    mockGetSavingsGoals.mockResolvedValue({ success: true, data: [] });
  });

  const renderGrid = () => (
    <SavingsGoalsGrid dictionary={defaultDictionary} locale="es-CO" />
  );

  it('should show a skeleton while goals are loading', () => {
    mockGetSavingsGoals.mockReturnValue(new Promise<never>(() => {}));

    const { container } = render(renderGrid());

    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(4);
  });

  it('should show the error alert and allow retry', async () => {
    mockGetSavingsGoals
      .mockResolvedValueOnce({ success: false, error: 'load failed' })
      .mockResolvedValueOnce({ success: true, data: [makeGoal()] });

    render(renderGrid());

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('load failed');
    });

    fireEvent.click(screen.getByText('Reintentar'));

    await waitFor(() => {
      expect(screen.getByTestId('goal-card')).toBeInTheDocument();
    });
  });

  it('should show the empty state with an add-goal button', async () => {
    mockGetSavingsGoals.mockResolvedValue({ success: true, data: [] });

    render(renderGrid());

    await waitFor(() => {
      expect(screen.getByText('No hay metas')).toBeInTheDocument();
    });
    expect(screen.getByText('Agregar meta')).toBeInTheDocument();
  });

  it('should show the goal count header and cards when goals exist', async () => {
    mockGetSavingsGoals.mockResolvedValue({
      success: true,
      data: [
        makeGoal(),
        makeGoal({ id: 'clh99999999999999999999', name: 'Fondo de Emergencia' }),
      ],
    });

    render(renderGrid());

    await waitFor(() => {
      expect(screen.getByText('2 metas')).toBeInTheDocument();
    });
    expect(screen.getAllByTestId('goal-card')).toHaveLength(2);
  });

  it('should use singular "meta" when there is exactly one goal', async () => {
    mockGetSavingsGoals.mockResolvedValue({ success: true, data: [makeGoal()] });

    render(renderGrid());

    await waitFor(() => {
      expect(screen.getByText('1 meta')).toBeInTheDocument();
    });
  });

  it('should open the CreateSavingsGoalModal when add-goal is clicked', async () => {
    mockGetSavingsGoals.mockResolvedValue({ success: true, data: [makeGoal()] });

    render(renderGrid());

    await waitFor(() => {
      expect(screen.getByText('1 meta')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Agregar meta'));

    const calls = vi.mocked(CreateSavingsGoalModal).mock.calls;
    expect(calls[calls.length - 1][0].isOpen).toBe(true);
  });

  it('should open EditSavingsGoalModal when a goal is edited', async () => {
    const goal = makeGoal();
    mockGetSavingsGoals.mockResolvedValue({ success: true, data: [goal] });

    render(renderGrid());

    await waitFor(() => {
      expect(screen.getByTestId('goal-card')).toBeInTheDocument();
    });

    const cardProps = vi.mocked(SavingsGoalCard).mock.calls[0][0] as unknown as {
      onContribute: (goalId: string) => void;
      onEdit: (goal: GoalFixture) => void;
      onDelete: (goalId: string, goalName: string, hasContributions: boolean) => void;
    };
    act(() => {
      cardProps.onEdit(goal);
    });

    const calls = vi.mocked(EditSavingsGoalModal).mock.calls;
    expect(calls[calls.length - 1][0].isOpen).toBe(true);
    expect(calls[calls.length - 1][0].goal).toEqual(goal);
  });

  it('should open ContributeModal with the goal id when contributing', async () => {
    const goal = makeGoal();
    mockGetSavingsGoals.mockResolvedValue({ success: true, data: [goal] });

    render(renderGrid());

    await waitFor(() => {
      expect(screen.getByTestId('goal-card')).toBeInTheDocument();
    });

    const cardProps = vi.mocked(SavingsGoalCard).mock.calls[0][0] as unknown as {
      onContribute: (goalId: string) => void;
      onEdit: (goal: GoalFixture) => void;
      onDelete: (goalId: string, goalName: string, hasContributions: boolean) => void;
    };
    act(() => {
      cardProps.onContribute(goal.id);
    });

    const calls = vi.mocked(ContributeModal).mock.calls;
    expect(calls[calls.length - 1][0].goalId).toBe(goal.id);
    expect(calls[calls.length - 1][0].isOpen).toBe(true);
  });

  it('should open DeleteGoalModal with goal metadata when deleting', async () => {
    const goal = makeGoal();
    mockGetSavingsGoals.mockResolvedValue({ success: true, data: [goal] });

    render(renderGrid());

    await waitFor(() => {
      expect(screen.getByTestId('goal-card')).toBeInTheDocument();
    });

    const cardProps = vi.mocked(SavingsGoalCard).mock.calls[0][0] as unknown as {
      onContribute: (goalId: string) => void;
      onEdit: (goal: GoalFixture) => void;
      onDelete: (goalId: string, goalName: string, hasContributions: boolean) => void;
    };
    act(() => {
      cardProps.onDelete(goal.id, goal.name, true);
    });

    const calls = vi.mocked(DeleteGoalModal).mock.calls;
    expect(calls[calls.length - 1][0].goalId).toBe(goal.id);
    expect(calls[calls.length - 1][0].goalName).toBe('Vacaciones 2026');
    expect(calls[calls.length - 1][0].hasContributions).toBe(true);
    expect(calls[calls.length - 1][0].isOpen).toBe(true);
  });

  it('should reload goals when a modal is closed', async () => {
    const goal = makeGoal();
    mockGetSavingsGoals.mockResolvedValue({ success: true, data: [goal] });

    render(renderGrid());

    await waitFor(() => {
      expect(screen.getByTestId('goal-card')).toBeInTheDocument();
    });

    const cardProps = vi.mocked(SavingsGoalCard).mock.calls[0][0] as unknown as {
      onContribute: (goalId: string) => void;
      onEdit: (goal: GoalFixture) => void;
      onDelete: (goalId: string, goalName: string, hasContributions: boolean) => void;
    };
    act(() => {
      cardProps.onDelete(goal.id, goal.name, false);
    });

    await waitFor(() => {
      const calls = vi.mocked(DeleteGoalModal).mock.calls;
      expect(calls[calls.length - 1][0].isOpen).toBe(true);
    });

    const callsBefore = mockGetSavingsGoals.mock.calls.length;
    const deleteProps = vi.mocked(DeleteGoalModal).mock.calls.at(-1)![0];
    act(() => {
      deleteProps.onClose();
    });

    await waitFor(() => {
      expect(mockGetSavingsGoals.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });
});