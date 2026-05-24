/**
 * Savings Schemas Unit Tests
 * Covers all 7 Zod schemas with valid/invalid cases
 */
import { describe, it, expect } from 'vitest';
import {
  CreateSavingsGoalSchema,
  UpdateSavingsGoalSchema,
  ContributeToGoalSchema,
  GetSavingsSummarySchema,
  CalculateMaxSpendableSchema,
  DeleteSavingsGoalSchema,
  GetSavingsGoalsSchema,
} from '../savings.schema';

const VALID_CUID = 'clh1234567890abcdefghij';
const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

// ============================================================================
// CreateSavingsGoalSchema
// ============================================================================
describe('CreateSavingsGoalSchema', () => {
  const validInput = {
    name: 'Vacaciones 2026',
    targetAmountCents: 100000,
  };

  it('should accept valid input with minimum required fields', () => {
    const result = CreateSavingsGoalSchema.parse(validInput);
    expect(result.name).toBe('Vacaciones 2026');
    expect(result.targetAmountCents).toBe(100000);
    expect(result.type).toBe('CUSTOM'); // default
    expect(result.currency).toBe('COP'); // default
  });

  it('should accept valid input with all optional fields', () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    const result = CreateSavingsGoalSchema.parse({
      ...validInput,
      description: 'Ahorro para viaje a Japón',
      type: 'ANNUAL',
      currency: 'USD',
      deadline: futureDate,
      monthlyContributionCents: 50000,
      linkedAccountId: VALID_CUID,
      color: 'from-blue-500 to-cyan-500',
      icon: 'plane',
    });
    expect(result.description).toBe('Ahorro para viaje a Japón');
    expect(result.type).toBe('ANNUAL');
    expect(result.currency).toBe('USD');
    expect(result.monthlyContributionCents).toBe(50000);
    expect(result.linkedAccountId).toBe(VALID_CUID);
  });

  it('should accept type SHORT_TERM', () => {
    const result = CreateSavingsGoalSchema.parse({ ...validInput, type: 'SHORT_TERM' });
    expect(result.type).toBe('SHORT_TERM');
  });

  it('should accept type EMERGENCY', () => {
    const result = CreateSavingsGoalSchema.parse({ ...validInput, type: 'EMERGENCY' });
    expect(result.type).toBe('EMERGENCY');
  });

  it('should reject empty name', () => {
    expect(() =>
      CreateSavingsGoalSchema.parse({ ...validInput, name: '' })
    ).toThrow('Name is required');
  });

  it('should reject name exceeding 100 characters', () => {
    expect(() =>
      CreateSavingsGoalSchema.parse({ ...validInput, name: 'x'.repeat(101) })
    ).toThrow('Name too long');
  });

  it('should trim whitespace from name', () => {
    const result = CreateSavingsGoalSchema.parse({ ...validInput, name: '  My Goal  ' });
    expect(result.name).toBe('My Goal');
  });

  it('should reject negative targetAmountCents', () => {
    expect(() =>
      CreateSavingsGoalSchema.parse({ ...validInput, targetAmountCents: -100 })
    ).toThrow('Target amount must be positive');
  });

  it('should reject zero targetAmountCents', () => {
    expect(() =>
      CreateSavingsGoalSchema.parse({ ...validInput, targetAmountCents: 0 })
    ).toThrow('Target amount must be positive');
  });

  it('should reject non-integer targetAmountCents', () => {
    expect(() =>
      CreateSavingsGoalSchema.parse({ ...validInput, targetAmountCents: 100.5 })
    ).toThrow('Target amount must be an integer');
  });

  it('should reject targetAmountCents exceeding MAX_SAFE_CENTS', () => {
    expect(() =>
      CreateSavingsGoalSchema.parse({ ...validInput, targetAmountCents: 99999999999999 })
    ).toThrow();
  });

  it('should reject invalid currency', () => {
    expect(() =>
      CreateSavingsGoalSchema.parse({ ...validInput, currency: 'GBP' })
    ).toThrow();
  });

  it('should accept COP currency', () => {
    const result = CreateSavingsGoalSchema.parse({ ...validInput, currency: 'COP' });
    expect(result.currency).toBe('COP');
  });

  it('should accept EUR currency', () => {
    const result = CreateSavingsGoalSchema.parse({ ...validInput, currency: 'EUR' });
    expect(result.currency).toBe('EUR');
  });

  it('should reject deadline in the past', () => {
    const pastDate = new Date('2020-01-01');
    expect(() =>
      CreateSavingsGoalSchema.parse({ ...validInput, deadline: pastDate })
    ).toThrow('Deadline must be in the future');
  });

  it('should reject negative monthlyContributionCents', () => {
    expect(() =>
      CreateSavingsGoalSchema.parse({ ...validInput, monthlyContributionCents: -100 })
    ).toThrow('Monthly contribution must be positive');
  });

  it('should reject monthlyContributionCents exceeding MAX_SAFE_CENTS', () => {
    expect(() =>
      CreateSavingsGoalSchema.parse({ ...validInput, monthlyContributionCents: 99999999999999 })
    ).toThrow();
  });

  it('should reject invalid linkedAccountId CUID', () => {
    expect(() =>
      CreateSavingsGoalSchema.parse({ ...validInput, linkedAccountId: 'invalid' })
    ).toThrow('Must be a valid CUID');
  });

  it('should reject invalid type value', () => {
    expect(() =>
      CreateSavingsGoalSchema.parse({ ...validInput, type: 'INVALID' })
    ).toThrow();
  });
});

// ============================================================================
// UpdateSavingsGoalSchema
// ============================================================================
describe('UpdateSavingsGoalSchema', () => {
  const validInput = {
    goalId: VALID_CUID,
  };

  it('should accept valid input with only goalId (all fields optional)', () => {
    const result = UpdateSavingsGoalSchema.parse(validInput);
    expect(result.goalId).toBe(VALID_CUID);
  });

  it('should accept valid input with all fields', () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    const result = UpdateSavingsGoalSchema.parse({
      ...validInput,
      name: 'Updated Goal',
      description: 'New description',
      targetAmountCents: 200000,
      deadline: futureDate,
      monthlyContributionCents: 75000,
      color: 'from-emerald-500 to-teal-500',
      status: 'ACTIVE',
    });
    expect(result.name).toBe('Updated Goal');
    expect(result.description).toBe('New description');
    expect(result.targetAmountCents).toBe(200000);
    expect(result.status).toBe('ACTIVE');
  });

  it('should reject missing goalId', () => {
    expect(() =>
      UpdateSavingsGoalSchema.parse({})
    ).toThrow();
  });

  it('should reject invalid goalId CUID', () => {
    expect(() =>
      UpdateSavingsGoalSchema.parse({ goalId: 'not-cuid' })
    ).toThrow('Must be a valid CUID');
  });

  it('should reject empty name when provided', () => {
    expect(() =>
      UpdateSavingsGoalSchema.parse({ ...validInput, name: '' })
    ).toThrow('Name is required');
  });

  it('should reject name exceeding 100 characters', () => {
    expect(() =>
      UpdateSavingsGoalSchema.parse({ ...validInput, name: 'x'.repeat(101) })
    ).toThrow('Name too long');
  });

  it('should reject negative targetAmountCents when provided', () => {
    expect(() =>
      UpdateSavingsGoalSchema.parse({ ...validInput, targetAmountCents: -100 })
    ).toThrow('Target amount must be positive');
  });

  it('should reject deadline in the past when provided', () => {
    const pastDate = new Date('2020-01-01');
    expect(() =>
      UpdateSavingsGoalSchema.parse({ ...validInput, deadline: pastDate })
    ).toThrow('Deadline must be in the future');
  });

  it('should reject invalid status value', () => {
    expect(() =>
      UpdateSavingsGoalSchema.parse({ ...validInput, status: 'INVALID' })
    ).toThrow();
  });

  it('should accept COMPLETED status', () => {
    const result = UpdateSavingsGoalSchema.parse({ ...validInput, status: 'COMPLETED' });
    expect(result.status).toBe('COMPLETED');
  });

  it('should accept CANCELLED status', () => {
    const result = UpdateSavingsGoalSchema.parse({ ...validInput, status: 'CANCELLED' });
    expect(result.status).toBe('CANCELLED');
  });

  it('should reject monthlyContributionCents when provided as negative', () => {
    expect(() =>
      UpdateSavingsGoalSchema.parse({ ...validInput, monthlyContributionCents: -1 })
    ).toThrow('Monthly contribution must be positive');
  });
});

// ============================================================================
// ContributeToGoalSchema
// ============================================================================
describe('ContributeToGoalSchema', () => {
  const validInput = {
    goalId: VALID_CUID,
    amountCents: 50000,
    currency: 'COP',
    idempotencyKey: VALID_UUID,
  };

  it('should accept valid input', () => {
    const result = ContributeToGoalSchema.parse(validInput);
    expect(result.goalId).toBe(VALID_CUID);
    expect(result.amountCents).toBe(50000);
    expect(result.currency).toBe('COP');
    expect(result.idempotencyKey).toBe(VALID_UUID);
  });

  it('should accept input with optional sourceAccountId and notes', () => {
    const result = ContributeToGoalSchema.parse({
      ...validInput,
      sourceAccountId: VALID_CUID,
      notes: 'Monthly contribution',
    });
    expect(result.sourceAccountId).toBe(VALID_CUID);
    expect(result.notes).toBe('Monthly contribution');
  });

  it('should reject negative amountCents', () => {
    expect(() =>
      ContributeToGoalSchema.parse({ ...validInput, amountCents: -100 })
    ).toThrow('Amount must be positive');
  });

  it('should reject zero amountCents', () => {
    expect(() =>
      ContributeToGoalSchema.parse({ ...validInput, amountCents: 0 })
    ).toThrow('Amount must be positive');
  });

  it('should reject non-integer amountCents', () => {
    expect(() =>
      ContributeToGoalSchema.parse({ ...validInput, amountCents: 100.5 })
    ).toThrow('Amount must be an integer');
  });

  it('should reject amountCents exceeding MAX_SAFE_CENTS', () => {
    expect(() =>
      ContributeToGoalSchema.parse({ ...validInput, amountCents: 99999999999999 })
    ).toThrow();
  });

  it('should reject missing currency', () => {
    const { currency: _, ...withoutCurrency } = validInput;
    expect(() =>
      ContributeToGoalSchema.parse(withoutCurrency)
    ).toThrow();
  });

  it('should reject invalid currency', () => {
    expect(() =>
      ContributeToGoalSchema.parse({ ...validInput, currency: 'GBP' })
    ).toThrow();
  });

  it('should reject invalid idempotencyKey (non-UUID)', () => {
    expect(() =>
      ContributeToGoalSchema.parse({ ...validInput, idempotencyKey: 'not-a-uuid' })
    ).toThrow('Must be a valid UUID v4');
  });

  it('should reject invalid goalId CUID', () => {
    expect(() =>
      ContributeToGoalSchema.parse({ ...validInput, goalId: 'bad-cuid' })
    ).toThrow('Must be a valid CUID');
  });

  it('should reject invalid sourceAccountId CUID', () => {
    expect(() =>
      ContributeToGoalSchema.parse({ ...validInput, sourceAccountId: 'bad-cuid' })
    ).toThrow('Must be a valid CUID');
  });

  it('should reject notes exceeding 500 characters', () => {
    expect(() =>
      ContributeToGoalSchema.parse({ ...validInput, notes: 'x'.repeat(501) })
    ).toThrow();
  });
});

// ============================================================================
// GetSavingsSummarySchema
// ============================================================================
describe('GetSavingsSummarySchema', () => {
  it('should accept empty object (all fields optional)', () => {
    const result = GetSavingsSummarySchema.parse({});
    expect(result.month).toBeUndefined();
    expect(result.year).toBeUndefined();
  });

  it('should accept valid month and year', () => {
    const result = GetSavingsSummarySchema.parse({ month: 6, year: 2025 });
    expect(result.month).toBe(6);
    expect(result.year).toBe(2025);
  });

  it('should reject month > 12', () => {
    expect(() => GetSavingsSummarySchema.parse({ month: 13 })).toThrow();
  });

  it('should reject month < 1', () => {
    expect(() => GetSavingsSummarySchema.parse({ month: 0 })).toThrow();
  });

  it('should reject month with decimal', () => {
    expect(() => GetSavingsSummarySchema.parse({ month: 6.5 })).toThrow();
  });

  it('should reject year < 2000', () => {
    expect(() => GetSavingsSummarySchema.parse({ year: 1999 })).toThrow();
  });

  it('should reject year > 2100', () => {
    expect(() => GetSavingsSummarySchema.parse({ year: 2101 })).toThrow();
  });

  it('should reject year with decimal', () => {
    expect(() => GetSavingsSummarySchema.parse({ year: 2025.5 })).toThrow();
  });

  it('should accept month 1 and year 2000 (boundary)', () => {
    const result = GetSavingsSummarySchema.parse({ month: 1, year: 2000 });
    expect(result.month).toBe(1);
    expect(result.year).toBe(2000);
  });

  it('should accept month 12 and year 2100 (boundary)', () => {
    const result = GetSavingsSummarySchema.parse({ month: 12, year: 2100 });
    expect(result.month).toBe(12);
    expect(result.year).toBe(2100);
  });
});

// ============================================================================
// CalculateMaxSpendableSchema
// ============================================================================
describe('CalculateMaxSpendableSchema', () => {
  it('should accept valid month and year', () => {
    const result = CalculateMaxSpendableSchema.parse({ month: 3, year: 2025 });
    expect(result.month).toBe(3);
    expect(result.year).toBe(2025);
  });

  it('should reject missing month', () => {
    expect(() => CalculateMaxSpendableSchema.parse({ year: 2025 })).toThrow();
  });

  it('should reject missing year', () => {
    expect(() => CalculateMaxSpendableSchema.parse({ month: 3 })).toThrow();
  });

  it('should reject month > 12', () => {
    expect(() => CalculateMaxSpendableSchema.parse({ month: 13, year: 2025 })).toThrow();
  });

  it('should reject month < 1', () => {
    expect(() => CalculateMaxSpendableSchema.parse({ month: 0, year: 2025 })).toThrow();
  });

  it('should reject year < 2000', () => {
    expect(() => CalculateMaxSpendableSchema.parse({ month: 3, year: 1999 })).toThrow();
  });

  it('should reject year > 2100', () => {
    expect(() => CalculateMaxSpendableSchema.parse({ month: 3, year: 2101 })).toThrow();
  });

  it('should reject non-integer month', () => {
    expect(() => CalculateMaxSpendableSchema.parse({ month: 3.5, year: 2025 })).toThrow();
  });

  it('should reject non-integer year', () => {
    expect(() => CalculateMaxSpendableSchema.parse({ month: 3, year: 2025.5 })).toThrow();
  });
});

// ============================================================================
// DeleteSavingsGoalSchema
// ============================================================================
describe('DeleteSavingsGoalSchema', () => {
  it('should accept valid goalId', () => {
    const result = DeleteSavingsGoalSchema.parse({ goalId: VALID_CUID });
    expect(result.goalId).toBe(VALID_CUID);
  });

  it('should reject missing goalId', () => {
    expect(() => DeleteSavingsGoalSchema.parse({})).toThrow();
  });

  it('should reject invalid goalId CUID', () => {
    expect(() =>
      DeleteSavingsGoalSchema.parse({ goalId: 'not-cuid' })
    ).toThrow('Must be a valid CUID');
  });
});

// ============================================================================
// GetSavingsGoalsSchema
// ============================================================================
describe('GetSavingsGoalsSchema', () => {
  it('should accept empty object (status optional)', () => {
    const result = GetSavingsGoalsSchema.parse({});
    expect(result.status).toBeUndefined();
  });

  it('should accept valid status ACTIVE', () => {
    const result = GetSavingsGoalsSchema.parse({ status: 'ACTIVE' });
    expect(result.status).toBe('ACTIVE');
  });

  it('should accept valid status COMPLETED', () => {
    const result = GetSavingsGoalsSchema.parse({ status: 'COMPLETED' });
    expect(result.status).toBe('COMPLETED');
  });

  it('should accept valid status CANCELLED', () => {
    const result = GetSavingsGoalsSchema.parse({ status: 'CANCELLED' });
    expect(result.status).toBe('CANCELLED');
  });

  it('should reject invalid status', () => {
    expect(() => GetSavingsGoalsSchema.parse({ status: 'INVALID' })).toThrow();
  });
});
