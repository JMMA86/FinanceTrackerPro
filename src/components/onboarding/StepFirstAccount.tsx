'use client';

import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2 } from 'lucide-react';
import type { Currency } from '@prisma/client';
import { createBankAccount } from '@/actions/account.actions';
import { FormattedNumericInput } from '@/components/ui/FormattedNumericInput';
import type { OnboardingAccountSummary } from './types';
import { t, interpolate } from './i18n-helpers';

const ACCOUNT_TYPES = ['CHECKING', 'CASH', 'SAVINGS'] as const;
const CURRENCIES = ['COP', 'USD', 'EUR'] as const;

/** Mirrors the server-side `ACCOUNT_NAME` rule in `account.schema.ts`. */
const ACCOUNT_NAME_PATTERN = /^[\w\s\-áéíóúÁÉÍÓÚñÑüÜ]+$/;
const MAX_BALANCE_CENTS = 9_999_999_999_999;

interface AccountFormValues {
  name: string;
  type: (typeof ACCOUNT_TYPES)[number];
  currency: Currency;
  initialBalanceCents: number;
}

interface StepFirstAccountProps {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  titleId: string;
  dictionary: Record<string, unknown>;
  baseCurrency: Currency;
  /** Stable UUID v4 reused across retries until the account is created. */
  idempotencyKey: string;
  createdAccount: OnboardingAccountSummary | null;
  hasExistingAccounts: boolean;
  onCreated: (account: OnboardingAccountSummary) => void;
}

/** Step 1 — create the user's first bank account. */
export function StepFirstAccount({
  headingRef,
  titleId,
  dictionary,
  baseCurrency,
  idempotencyKey,
  createdAccount,
  hasExistingAccounts,
  onCreated,
}: Readonly<StepFirstAccountProps>) {
  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, t(dictionary, 'errors.nameRequired'))
          .max(100, t(dictionary, 'errors.nameTooLong'))
          .regex(ACCOUNT_NAME_PATTERN, t(dictionary, 'errors.nameInvalid')),
        type: z.enum(ACCOUNT_TYPES),
        currency: z.enum(CURRENCIES),
        initialBalanceCents: z.number().int().min(0).max(MAX_BALANCE_CENTS),
      }),
    [dictionary]
  );

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<AccountFormValues>({
    resolver: zodResolver(schema) as Resolver<AccountFormValues>,
    defaultValues: {
      name: '',
      type: 'CHECKING',
      currency: baseCurrency,
      initialBalanceCents: 0,
    },
  });

  const balanceCents = useWatch({ control, name: 'initialBalanceCents' }) ?? 0;
  const [serverError, setServerError] = useState<string | null>(null);

  async function onSubmit(data: AccountFormValues) {
    setServerError(null);

    const result = await createBankAccount({
      idempotencyKey,
      name: data.name,
      type: data.type,
      currency: data.currency,
      initialBalanceCents: data.initialBalanceCents,
    });

    if (result.success && result.data) {
      onCreated({
        id: result.data.account.id,
        name: result.data.account.name,
        currency: result.data.account.currency,
      });
      return;
    }

    setServerError(
      result.code === 'SESSION_INVALID' || result.code === 'UNAUTHORIZED'
        ? t(dictionary, 'errors.sessionInvalid')
        : t(dictionary, 'errors.accountCreateFailed')
    );
  }

  const inputCls =
    'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-transparent transition-all';
  const selectCls =
    'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-transparent transition-all';
  const labelCls = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-300';

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h2
          ref={headingRef}
          id={titleId}
          tabIndex={-1}
          className="text-2xl font-bold text-white focus:outline-none sm:text-3xl"
        >
          {t(dictionary, 'steps.account.title')}
        </h2>
        <p className="text-sm leading-relaxed text-slate-300">
          {t(dictionary, 'steps.account.subtitle')}
        </p>
      </div>

      {hasExistingAccounts && !createdAccount && (
        <p className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 text-sm text-blue-200">
          {t(dictionary, 'steps.account.existingNote')}
        </p>
      )}

      {createdAccount ? (
        <div
          role="status"
          aria-live="polite"
          className="animate-scale-in flex flex-col items-start gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5"
        >
          <div className="flex items-center gap-2 text-emerald-300">
            <span className="animate-celebrate-glow flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/20">
              <CheckCircle2 className="animate-check-pop h-5 w-5" aria-hidden="true" />
            </span>
            <p className="text-sm font-semibold">{t(dictionary, 'steps.account.successTitle')}</p>
          </div>
          <p
            className="animate-slideUp text-sm text-emerald-100"
            style={{ animationDelay: '120ms' }}
          >
            {interpolate(t(dictionary, 'steps.account.successMessage'), {
              name: createdAccount.name,
            })}
          </p>
          <p className="animate-fadeIn text-xs text-slate-300" style={{ animationDelay: '220ms' }}>
            {t(dictionary, 'steps.account.continueHint')}
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="animate-stagger space-y-4" noValidate>
          <div>
            <label htmlFor="onboarding-account-name" className={labelCls}>
              {t(dictionary, 'steps.account.nameLabel')}
            </label>
            <input
              id="onboarding-account-name"
              type="text"
              autoComplete="off"
              placeholder={t(dictionary, 'steps.account.namePlaceholder')}
              aria-invalid={errors.name ? 'true' : 'false'}
              aria-describedby={errors.name ? 'onboarding-account-name-error' : undefined}
              className={inputCls}
              {...register('name')}
            />
            {errors.name && (
              <p
                id="onboarding-account-name-error"
                role="alert"
                className="mt-1 text-xs text-red-400"
              >
                {errors.name.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="onboarding-account-type" className={labelCls}>
                {t(dictionary, 'steps.account.typeLabel')}
              </label>
              <select
                id="onboarding-account-type"
                className={selectCls}
                aria-invalid={errors.type ? 'true' : 'false'}
                {...register('type')}
              >
                {ACCOUNT_TYPES.map((type) => (
                  <option key={type} value={type} className="bg-slate-800">
                    {t(dictionary, `accountTypes.${type}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="onboarding-account-currency" className={labelCls}>
                {t(dictionary, 'steps.account.currencyLabel')}
              </label>
              <select
                id="onboarding-account-currency"
                className={selectCls}
                aria-invalid={errors.currency ? 'true' : 'false'}
                {...register('currency')}
              >
                {CURRENCIES.map((code) => (
                  <option key={code} value={code} className="bg-slate-800">
                    {code}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="onboarding-account-balance" className={labelCls}>
              {t(dictionary, 'steps.account.balanceLabel')}
            </label>
            <FormattedNumericInput
              id="onboarding-account-balance"
              value={balanceCents}
              onChange={(value) => setValue('initialBalanceCents', value, { shouldValidate: true })}
              aria-invalid={errors.initialBalanceCents ? 'true' : 'false'}
              aria-describedby="onboarding-account-balance-hint"
              className={`${inputCls} font-mono tabular-nums`}
            />
            <p id="onboarding-account-balance-hint" className="mt-1 text-xs text-slate-500">
              {t(dictionary, 'steps.account.balanceHint')}
            </p>
          </div>

          {serverError && (
            <p
              role="alert"
              className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"
            >
              {serverError}
            </p>
          )}

          <button type="submit" disabled={isSubmitting} className="btn-primary w-full sm:w-auto">
            {isSubmitting
              ? t(dictionary, 'steps.account.submitting')
              : t(dictionary, 'steps.account.submit')}
          </button>
        </form>
      )}
    </section>
  );
}
