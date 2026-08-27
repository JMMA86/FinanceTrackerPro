/**
 * SavingsGoalCard Component Tests
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SavingsGoalCard } from '../SavingsGoalCard';

// Mock formatMoney
vi.mock('@/lib/money', () => ({
  formatMoney: vi.fn((cents: number, currency: string, _locale?: string) => {
    const amount = (cents / 100).toFixed(2);
    const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '$';
    return `${symbol}${amount} ${currency}`;
  }),
}));

// Mock i18n get function
vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const keyMap: Record<string, string> = {
      completed: 'Completado',
      progress: 'Progreso',
      saved: 'Ahorrado',
      target: 'Meta',
      noDeadline: 'Sin fecha límite',
      'types.ANNUAL': 'Anual',
      'types.SHORT_TERM': 'Corto Plazo',
      'types.EMERGENCY': 'Emergencia',
      'types.CUSTOM': 'Personalizada',
      contribute: 'Contribuir',
      updateGoal: 'Editar',
      deleteGoal: 'Eliminar',
      projectedCompletion: 'Proyección',
      noProjection: 'Sin proyección',
      remaining: 'Restante',
      daysLeft: 'días restantes',
      monthsLeft: 'meses restantes',
      overduePrefix: 'Vencido hace',
      overdueDays: 'días',
      deadlineToday: 'Hoy',
      deadlineTomorrow: 'Mañana',
      recentContributions: 'Últimas contribuciones',
    };
    return keyMap[key] ?? key;
  }),
}));

describe('SavingsGoalCard', () => {
  const mockOnContribute = vi.fn();
  const mockOnEdit = vi.fn();
  const mockOnDelete = vi.fn();

  const baseGoal = {
    id: 'goal-1',
    userId: 'user-1',
    name: 'Vacaciones 2026',
    description: 'Ahorro para viaje',
    type: 'ANNUAL' as const,
    targetAmountCents: 200000,
    currency: 'COP' as const,
    currentAmountCents: 50000,
    deadline: null,
    monthlyContributionCents: 25000,
    linkedAccountId: null,
    linkedAccount: null,
    status: 'ACTIVE' as const,
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
  };

  const defaultDictionary = {};

  it('should render the goal name', () => {
    render(
      <SavingsGoalCard
        goal={baseGoal}
        dictionary={defaultDictionary}
        locale="es-CO"
        onContribute={mockOnContribute}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );
    expect(screen.getByText('Vacaciones 2026')).toBeInTheDocument();
  });

  it('should render the type label', () => {
    render(
      <SavingsGoalCard
        goal={baseGoal}
        dictionary={defaultDictionary}
        locale="es-CO"
        onContribute={mockOnContribute}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );
    expect(screen.getByText('Anual')).toBeInTheDocument();
  });

  it('should render progress percentage', () => {
    render(
      <SavingsGoalCard
        goal={baseGoal}
        dictionary={defaultDictionary}
        locale="es-CO"
        onContribute={mockOnContribute}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );
    expect(screen.getByText('25.0%')).toBeInTheDocument();
  });

  it('should render the saved amount', () => {
    render(
      <SavingsGoalCard
        goal={baseGoal}
        dictionary={defaultDictionary}
        locale="es-CO"
        onContribute={mockOnContribute}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );
    expect(screen.getByText('$500.00 COP')).toBeInTheDocument();
  });

  it('should render the target amount', () => {
    render(
      <SavingsGoalCard
        goal={baseGoal}
        dictionary={defaultDictionary}
        locale="es-CO"
        onContribute={mockOnContribute}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );
    expect(screen.getByText('$2000.00 COP')).toBeInTheDocument();
  });

  it('should have progressbar with correct aria-valuenow', () => {
    render(
      <SavingsGoalCard
        goal={baseGoal}
        dictionary={defaultDictionary}
        locale="es-CO"
        onContribute={mockOnContribute}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );
    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toHaveAttribute('aria-valuenow', '25');
    expect(progressbar).toHaveAttribute('aria-valuemin', '0');
    expect(progressbar).toHaveAttribute('aria-valuemax', '100');
  });

  it('should show "Completado" badge when status is COMPLETED', () => {
    const completedGoal = {
      ...baseGoal,
      status: 'COMPLETED' as const,
      currentAmountCents: 200000,
      progressPercentage: 100,
    };
    render(
      <SavingsGoalCard
        goal={completedGoal}
        dictionary={defaultDictionary}
        locale="es-CO"
        onContribute={mockOnContribute}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );
    expect(screen.getByText('Completado')).toBeInTheDocument();
  });

  it('should have article role with correct aria-label', () => {
    render(
      <SavingsGoalCard
        goal={baseGoal}
        dictionary={defaultDictionary}
        locale="es-CO"
        onContribute={mockOnContribute}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );
    const article = screen.getByRole('article');
    expect(article).toHaveAttribute('aria-label', 'Vacaciones 2026 - Anual');
  });

  it('should call onContribute when contribute button is clicked', () => {
    render(
      <SavingsGoalCard
        goal={baseGoal}
        dictionary={defaultDictionary}
        locale="es-CO"
        onContribute={mockOnContribute}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );
    const contributeBtn = screen.getByRole('button', { name: /contribuir.*vacaciones 2026/i });
    fireEvent.click(contributeBtn);
    expect(mockOnContribute).toHaveBeenCalledWith('goal-1');
  });

  it('should call onEdit when edit button is clicked', () => {
    render(
      <SavingsGoalCard
        goal={baseGoal}
        dictionary={defaultDictionary}
        locale="es-CO"
        onContribute={mockOnContribute}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );
    const editBtn = screen.getByRole('button', { name: /editar.*vacaciones 2026/i });
    fireEvent.click(editBtn);
    expect(mockOnEdit).toHaveBeenCalledWith(baseGoal);
  });

  it('should call onDelete with goalId and hasContributions=false when delete button is clicked', () => {
    render(
      <SavingsGoalCard
        goal={baseGoal}
        dictionary={defaultDictionary}
        locale="es-CO"
        onContribute={mockOnContribute}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );
    const deleteBtn = screen.getByRole('button', { name: /eliminar.*vacaciones 2026/i });
    fireEvent.click(deleteBtn);
    expect(mockOnDelete).toHaveBeenCalledWith('goal-1', 'Vacaciones 2026', false);
  });

  it('should show no deadline section when deadline is null', () => {
    render(
      <SavingsGoalCard
        goal={baseGoal}
        dictionary={defaultDictionary}
        locale="es-CO"
        onContribute={mockOnContribute}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );
    // The calendar icon for deadline should not be present
    expect(
      screen.queryByText(/Vencido|Hoy|Mañana|días restantes|meses restantes/)
    ).not.toBeInTheDocument();
  });

  it('should render deadline text when deadline is provided', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 15);
    const goalWithDeadline = { ...baseGoal, deadline: futureDate };
    render(
      <SavingsGoalCard
        goal={goalWithDeadline}
        dictionary={defaultDictionary}
        locale="es-CO"
        onContribute={mockOnContribute}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );
    expect(screen.getByText(/\d+ días restantes/)).toBeInTheDocument();
  });

  it('should show remaining amount when goal is not completed and remaining > 0', () => {
    render(
      <SavingsGoalCard
        goal={baseGoal}
        dictionary={defaultDictionary}
        locale="es-CO"
        onContribute={mockOnContribute}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );
    expect(screen.getByText('Restante')).toBeInTheDocument();
    expect(screen.getByText('$1500.00 COP')).toBeInTheDocument();
  });

  it('should render recent contributions when present', () => {
    const goalWithContributions = {
      ...baseGoal,
      contributions: [
        {
          id: 'c1',
          goalId: 'goal-1',
          amountCents: 10000,
          currency: 'COP' as const,
          date: new Date(),
          notes: null,
          sourceAccountId: null,
          transactionId: null,
          idempotencyKey: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          createdBy: 'user-1',
          lastModifiedBy: 'user-1',
          ipAddress: null,
          userAgent: null,
        },
        {
          id: 'c2',
          goalId: 'goal-1',
          amountCents: 15000,
          currency: 'COP' as const,
          date: new Date(),
          notes: null,
          sourceAccountId: null,
          transactionId: null,
          idempotencyKey: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          createdBy: 'user-1',
          lastModifiedBy: 'user-1',
          ipAddress: null,
          userAgent: null,
        },
      ],
    };
    render(
      <SavingsGoalCard
        goal={goalWithContributions}
        dictionary={defaultDictionary}
        locale="es-CO"
        onContribute={mockOnContribute}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );
    expect(screen.getByText('Últimas contribuciones')).toBeInTheDocument();
  });

  it('should disable contribute button when goal is completed', () => {
    const completedGoal = {
      ...baseGoal,
      status: 'COMPLETED' as const,
      currentAmountCents: 200000,
      progressPercentage: 100,
    };
    render(
      <SavingsGoalCard
        goal={completedGoal}
        dictionary={defaultDictionary}
        locale="es-CO"
        onContribute={mockOnContribute}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );
    const contributeBtn = screen.getByRole('button', { name: /contribuir.*vacaciones 2026/i });
    expect(contributeBtn).toBeDisabled();
  });

  it('should render linked account name when present', () => {
    const goalWithAccount = {
      ...baseGoal,
      linkedAccount: { id: 'acc-1', name: 'Mi Cuenta de Ahorros', currency: 'COP' },
    };
    render(
      <SavingsGoalCard
        goal={goalWithAccount}
        dictionary={defaultDictionary}
        locale="es-CO"
        onContribute={mockOnContribute}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );
    expect(screen.getByText('· Mi Cuenta de Ahorros')).toBeInTheDocument();
  });

  it('should show "Sin proyección" when no monthlyContributionCents and no projectedCompletion', () => {
    const goalWithoutProjection = {
      ...baseGoal,
      monthlyContributionCents: null as unknown as number | null,
      projectedCompletion: null,
    };
    render(
      <SavingsGoalCard
        goal={goalWithoutProjection}
        dictionary={defaultDictionary}
        locale="es-CO"
        onContribute={mockOnContribute}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );
    expect(screen.getByText('Sin proyección')).toBeInTheDocument();
  });
});
