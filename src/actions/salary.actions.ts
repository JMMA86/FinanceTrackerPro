'use server';
import 'server-only';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { safeAction } from '@/lib/utils/action-wrapper';
import { log } from '@/lib/logger';
import { getClientInfo } from '@/lib/utils/client-info';
import { UnauthorizedError } from '@/lib/errors/api-errors';
import { SaveSalaryConfigurationSchema, ProjectionSettingsSchema } from './salary.schema';
import type { BonusFrequency, Currency, SalaryFrequency } from '@prisma/client';

// ============================================================================
// Public contracts (BigInt serialized to number, RSC/JSON safe)
// ============================================================================

export interface SalaryBonusData {
  id: string;
  name: string;
  amountCents: number;
  currency: Currency;
  frequency: BonusFrequency;
  anchorMonth: number;
  dayOfMonth: number | null;
}

export interface SalaryConfigurationData {
  id: string;
  amountCents: number;
  currency: Currency;
  frequency: SalaryFrequency;
  /**
   * Payment days interpreted per `frequency` (WEEKLY: 1 ISO weekday 1..7;
   * BIWEEKLY: 2 days of the month 1..31; MONTHLY: 1 day of the month 1..31).
   */
  payDays: number[];
  bonuses: SalaryBonusData[];
}

export interface SalaryConfigurationResponse {
  /** `true` when an ACTIVE salary configuration exists for the session user. */
  configured: boolean;
  configuration: SalaryConfigurationData | null;
}

export interface ProjectionSettingsResponse {
  configured: boolean;
  /** Monthly savings target (COP cents, Rule 2). */
  monthlySavingsTargetCents: number;
  currency: Currency;
}

export interface SalaryPrefill {
  configured: boolean;
  categoryId: string | null;
  amountCents: number;
  description: string;
  currency: Currency;
}

// ============================================================================
// Serialization (Rule 2: BigInt cents -> number)
// ============================================================================

function serializeBonus(bonus: {
  id: string;
  name: string;
  amountCents: bigint;
  currency: Currency;
  frequency: BonusFrequency;
  anchorMonth: number;
  dayOfMonth: number | null;
}): SalaryBonusData {
  return {
    id: bonus.id,
    name: bonus.name,
    amountCents: Number(bonus.amountCents),
    currency: bonus.currency,
    frequency: bonus.frequency,
    anchorMonth: bonus.anchorMonth,
    dayOfMonth: bonus.dayOfMonth,
  };
}

// ============================================================================
// 1. getSalaryConfiguration — active configuration + active bonuses
// ============================================================================

async function getSalaryConfigurationInternal(
  _input: Record<string, never>
): Promise<SalaryConfigurationResponse> {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  // `userId` is @unique, so the 1:1 lookup is a single indexed read. Soft-deleted
  // configurations are treated as "not configured" (Rule 4).
  const configuration = await prisma.salaryConfiguration.findUnique({
    where: { userId: session.userId },
    include: {
      bonuses: { where: { isActive: true }, orderBy: [{ anchorMonth: 'asc' }, { name: 'asc' }] },
    },
  });

  if (!configuration?.isActive) {
    return { configured: false, configuration: null };
  }

  return {
    configured: true,
    configuration: {
      id: configuration.id,
      amountCents: Number(configuration.amountCents),
      currency: configuration.currency,
      frequency: configuration.frequency,
      payDays: configuration.payDays,
      bonuses: configuration.bonuses.map(serializeBonus),
    },
  };
}

export const getSalaryConfiguration = safeAction(getSalaryConfigurationInternal);

// ============================================================================
// 2. saveSalaryConfiguration — upsert config + synchronize bonuses atomically
//
// Rule 3: config upsert + bonus create/update/soft-delete run in ONE
//         `prisma.$transaction()` so a partial sync can never persist.
// Rule 4: removals are SOFT deletes (isActive:false + deletedAt), never DELETE.
// Rule 12: newly created bonuses get a server-generated UUID v4 idempotencyKey.
// Rule 14: createdBy/lastModifiedBy/ipAddress/userAgent on every write.
// ============================================================================

async function saveSalaryConfigurationInternal(
  input: unknown
): Promise<SalaryConfigurationResponse> {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = SaveSalaryConfigurationSchema.parse(input);
  const { ipAddress, userAgent } = await getClientInfo();
  const now = new Date();

  const configurationId = await prisma.$transaction(async (tx) => {
    const configuration = await tx.salaryConfiguration.upsert({
      where: { userId: session.userId },
      update: {
        amountCents: BigInt(validated.amountCents),
        currency: validated.currency,
        frequency: validated.frequency,
        payDays: validated.payDays,
        isActive: true,
        deletedAt: null,
        lastModifiedBy: session.userId,
        ipAddress,
        userAgent,
      },
      create: {
        userId: session.userId,
        amountCents: BigInt(validated.amountCents),
        currency: validated.currency,
        frequency: validated.frequency,
        payDays: validated.payDays,
        createdBy: session.userId,
        lastModifiedBy: session.userId,
        ipAddress,
        userAgent,
      },
    });

    // Complete-set semantics: bonuses omitted from the payload are soft-deleted.
    const existingBonuses = await tx.salaryBonus.findMany({
      where: { salaryConfigId: configuration.id, isActive: true },
      select: { id: true },
    });
    const incomingIds = new Set(
      validated.bonuses
        .map((bonus) => bonus.id)
        .filter((id): id is string => typeof id === 'string')
    );
    const obsoleteIds = existingBonuses
      .filter((bonus) => !incomingIds.has(bonus.id))
      .map((bonus) => bonus.id);

    if (obsoleteIds.length > 0) {
      await tx.salaryBonus.updateMany({
        // Re-assert config ownership in the WHERE so a forged id can never touch
        // another user's bonus rows.
        where: { id: { in: obsoleteIds }, salaryConfigId: configuration.id, isActive: true },
        data: {
          isActive: false,
          deletedAt: now,
          lastModifiedBy: session.userId,
          ipAddress,
          userAgent,
        },
      });
    }

    for (const bonus of validated.bonuses) {
      if (bonus.id) {
        // Ownership check: the id must belong to THIS user's configuration.
        const owned = await tx.salaryBonus.findFirst({
          where: { id: bonus.id, salaryConfigId: configuration.id },
          select: { id: true },
        });
        if (!owned) {
          throw new UnauthorizedError('Bonus does not belong to user');
        }

        await tx.salaryBonus.update({
          where: { id: owned.id },
          data: {
            name: bonus.name,
            amountCents: BigInt(bonus.amountCents),
            currency: bonus.currency,
            frequency: bonus.frequency,
            anchorMonth: bonus.anchorMonth,
            dayOfMonth: bonus.dayOfMonth ?? null,
            // Re-adding a previously removed bonus reactivates the same row
            // instead of creating a duplicate (audit trail preserved).
            isActive: true,
            deletedAt: null,
            lastModifiedBy: session.userId,
            ipAddress,
            userAgent,
          },
        });
      } else {
        await tx.salaryBonus.create({
          data: {
            salaryConfigId: configuration.id,
            name: bonus.name,
            amountCents: BigInt(bonus.amountCents),
            currency: bonus.currency,
            frequency: bonus.frequency,
            anchorMonth: bonus.anchorMonth,
            dayOfMonth: bonus.dayOfMonth ?? null,
            idempotencyKey: crypto.randomUUID(),
            createdBy: session.userId,
            lastModifiedBy: session.userId,
            ipAddress,
            userAgent,
          },
        });
      }
    }

    return configuration.id;
  });

  log.info(
    { action: 'salary.configuration.save', configurationId, userId: session.userId, ipAddress },
    'Salary configuration saved'
  );

  revalidatePath('/[lang]/settings', 'page');
  revalidatePath('/[lang]/dashboard', 'page');

  // Re-read the persisted, serialized state so the client receives exactly what
  // was stored (including reactivated/soft-deleted rows).
  const persisted = await getSalaryConfigurationInternal({});
  return persisted;
}

export const saveSalaryConfiguration = safeAction(saveSalaryConfigurationInternal);

// ============================================================================
// 3. getProjectionSettings — configurable savings target (COP, monthly)
// ============================================================================

async function getProjectionSettingsInternal(
  _input: Record<string, never>
): Promise<ProjectionSettingsResponse> {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const settings = await prisma.projectionSettings.findUnique({
    where: { userId: session.userId },
  });

  if (!settings?.isActive) {
    return {
      configured: false,
      monthlySavingsTargetCents: 0,
      currency: 'COP',
    };
  }

  return {
    configured: true,
    monthlySavingsTargetCents: Number(settings.monthlySavingsTargetCents),
    currency: settings.currency,
  };
}

export const getProjectionSettings = safeAction(getProjectionSettingsInternal);

// ============================================================================
// 4. saveProjectionSettings — upsert the savings target (COP, monthly)
// ============================================================================

async function saveProjectionSettingsInternal(input: unknown): Promise<ProjectionSettingsResponse> {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = ProjectionSettingsSchema.parse(input);
  const { ipAddress, userAgent } = await getClientInfo();

  const settings = await prisma.projectionSettings.upsert({
    where: { userId: session.userId },
    update: {
      monthlySavingsTargetCents: BigInt(validated.monthlySavingsTargetCents),
      currency: validated.currency,
      isActive: true,
      deletedAt: null,
      lastModifiedBy: session.userId,
      ipAddress,
      userAgent,
    },
    create: {
      userId: session.userId,
      monthlySavingsTargetCents: BigInt(validated.monthlySavingsTargetCents),
      currency: validated.currency,
      createdBy: session.userId,
      lastModifiedBy: session.userId,
      ipAddress,
      userAgent,
    },
  });

  // Mutation audit trail (Rule 14) — deliberately WITHOUT the monetary amount:
  // the audit event is kept at `info` (action + actor + client metadata) while the
  // financial figure is not propagated into logs.
  log.info(
    {
      action: 'projection.settings.save',
      userId: session.userId,
      ipAddress,
    },
    'Projection settings saved'
  );

  revalidatePath('/[lang]/settings', 'page');
  revalidatePath('/[lang]/dashboard', 'page');

  return {
    configured: true,
    monthlySavingsTargetCents: Number(settings.monthlySavingsTargetCents),
    currency: settings.currency,
  };
}

export const saveProjectionSettings = safeAction(saveProjectionSettingsInternal);

// ============================================================================
// 5. getSalaryPrefill — prefill an INCOME transaction from the salary config
//
// Returns the data the transaction modal needs to pre-populate amount +
// description (both remain EDITABLE by the user). `categoryId` is the system
// SALARY category, auto-resolved without a hardcoded id.
// ============================================================================

async function getSalaryPrefillInternal(_input: Record<string, never>): Promise<SalaryPrefill> {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const [configuration, salaryCategory] = await Promise.all([
    prisma.salaryConfiguration.findUnique({
      where: { userId: session.userId },
      select: { amountCents: true, currency: true, isActive: true },
    }),
    // System category lookup by TYPE (never a hardcoded id) so the seed id can
    // change without silently breaking the prefill.
    prisma.category.findFirst({
      where: { type: 'SALARY', userId: null, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    }),
  ]);

  const configured = configuration?.isActive === true;

  return {
    configured,
    categoryId: salaryCategory?.id ?? null,
    amountCents: configured ? Number(configuration.amountCents) : 0,
    description: 'Sueldo',
    currency: configured ? configuration.currency : 'COP',
  };
}

export const getSalaryPrefill = safeAction(getSalaryPrefillInternal);
