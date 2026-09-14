'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm, useWatch, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check } from 'lucide-react';
import { get } from '@/lib/i18n';
import { createTransaction } from '@/actions/transaction.actions';
import { getTransactionError } from '@/components/transactions/getTransactionError';
import { FormattedNumericInput } from '@/components/ui/FormattedNumericInput';
import { AccountSelect } from '@/components/transactions/AccountSelect';
import { isPocket } from '@/components/transactions/transferRules';
import type { AccountBrief } from '@/components/transactions/types';
import type { VariableExpenseDefinition } from '@/types/variable-expense';
import { VariableExpenseDialog } from './VariableExpenseDialog';
import { toDateInputValue } from './constants';

interface RegisterVariableExpenseModalProps {
  isOpen: boolean;
  /** Preselected definition; when null the modal renders its own selector. */
  definition: VariableExpenseDefinition | null;
  definitions: VariableExpenseDefinition[];
  /** Variable-expenses dictionary (labels). */
  dictionary: Record<string, unknown>;
  /** Transactions dictionary (error mapping). */
  transactionsDictionary: Record<string, unknown>;
  locale: string;
  onClose: () => void;
  onSuccess: () => void;
}

const RegisterSchema = z.object({
  accountId: z.string().min(1, 'Select an account'),
  amountCents: z
    .number()
    .int('Amount must be a whole number')
    .positive('Amount must be greater than 0'),
  date: z.string().optional(),
  notes: z.string().max(500, 'Notes are too long').optional(),
});

type RegisterFormData = z.infer<typeof RegisterSchema>;

const INPUT_CLS =
  'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500/60 focus:border-transparent transition-all';
const SELECT_CLS =
  'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-teal-500/60 focus:border-transparent transition-all appearance-none';
const LABEL_CLS = 'block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider';
const ERROR_CLS = 'mt-1 text-xs text-red-400';

/**
 * Register an EXPENSE against a monitored variable-expense definition. The
 * nature is inferred (always variable). The account list is filtered to the
 * definition currency; amount is manual and the category is optional.
 */
export function RegisterVariableExpenseModal({
  isOpen,
  definition,
  definitions,
  dictionary,
  transactionsDictionary,
  locale,
  onClose,
  onSuccess,
}: Readonly<RegisterVariableExpenseModalProps>) {
  const idempotencyKeyRef = useRef<string | null>(null);
  const [selectedDefinitionId, setSelectedDefinitionId] = useState('');
  const [accounts, setAccounts] = useState<AccountBrief[]>([]);
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [amountCents, setAmountCents] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(RegisterSchema) as Resolver<RegisterFormData>,
    defaultValues: {
      accountId: '',
      amountCents: 0,
      date: toDateInputValue(new Date()),
      notes: undefined,
    },
  });

  const selectedAccountId = useWatch({ control, name: 'accountId' });

  const activeDefinition = useMemo(
    () => definition ?? definitions.find((item) => item.id === selectedDefinitionId) ?? null,
    [definition, definitions, selectedDefinitionId]
  );

  const accountsForCurrency = useMemo(
    () =>
      activeDefinition
        ? accounts.filter((account) => account.currency === activeDefinition.currency)
        : [],
    [accounts, activeDefinition]
  );

  // Split the definition-currency accounts into the AccountSelect groups.
  const bankAccountOptions = useMemo(
    () =>
      accountsForCurrency.filter((account) => !isPocket(account) && account.type !== 'CREDIT_CARD'),
    [accountsForCurrency]
  );
  const creditCardOptions = useMemo(
    () => accountsForCurrency.filter((account) => account.type === 'CREDIT_CARD'),
    [accountsForCurrency]
  );
  const pocketOptions = useMemo(() => accountsForCurrency.filter(isPocket), [accountsForCurrency]);
  const parentNameById = useMemo(
    () => Object.fromEntries(accounts.map((account) => [account.id, account.name])),
    [accounts]
  );

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      setSelectedDefinitionId(definition?.id ?? '');
      setSubmitError(null);
      setAmountCents(0);
      setAssetsLoaded(false);
      reset({
        accountId: '',
        amountCents: 0,
        date: toDateInputValue(new Date()),
        notes: undefined,
      });
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = crypto.randomUUID();
      }
      void (async () => {
        try {
          const { getBankAccounts } = await import('@/actions/account.actions');
          const result = await getBankAccounts({});
          setAccounts(result.success && result.data ? result.data : []);
        } catch {
          setAccounts([]);
        } finally {
          setAssetsLoaded(true);
        }
      })();
    }, 0);
    return () => clearTimeout(timer);
  }, [isOpen, definition, reset]);

  // A definition change may invalidate the selected account currency.
  useEffect(() => {
    if (!activeDefinition || !selectedAccountId) return;
    const account = accounts.find((item) => item.id === selectedAccountId);
    if (account && account.currency !== activeDefinition.currency) {
      queueMicrotask(() => setValue('accountId', ''));
    }
  }, [activeDefinition, accounts, selectedAccountId, setValue]);

  const onSubmit = useCallback(
    async (data: RegisterFormData) => {
      setSubmitError(null);
      if (!activeDefinition) {
        setSubmitError(get(dictionary, 'errors.selectDefinition'));
        return;
      }
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = crypto.randomUUID();
      }
      try {
        const result = await createTransaction({
          idempotencyKey: idempotencyKeyRef.current,
          accountId: data.accountId,
          type: 'EXPENSE',
          amountCents: -data.amountCents,
          currency: activeDefinition.currency,
          description: data.notes || undefined,
          date: data.date ? new Date(data.date) : undefined,
          categoryId: activeDefinition.categoryId ?? undefined,
          variableExpenseId: activeDefinition.id,
        });
        if (result.success) {
          idempotencyKeyRef.current = null;
          onClose();
          onSuccess();
        } else {
          setSubmitError(getTransactionError(result, transactionsDictionary));
        }
      } catch {
        setSubmitError(get(dictionary, 'errors.registerFailed'));
      }
    },
    [activeDefinition, dictionary, transactionsDictionary, onClose, onSuccess]
  );

  const handleFormSubmit = useCallback(
    (event: React.SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      void handleSubmit(onSubmit)(event);
    },
    [handleSubmit, onSubmit]
  );

  let currencyNotice: string | null = null;
  if (activeDefinition && assetsLoaded && accountsForCurrency.length === 0) {
    currencyNotice = get(dictionary, 'noAccountsForCurrency');
  }

  return (
    <VariableExpenseDialog
      open={isOpen}
      titleId="register-variable-expense-title"
      title={
        <>
          {get(dictionary, 'registerExpense')}
          {activeDefinition && (
            <span className="text-slate-400 ml-1">— {activeDefinition.name}</span>
          )}
        </>
      }
      dictionary={dictionary}
      onClose={onClose}
    >
      <form onSubmit={handleFormSubmit} className="space-y-4" noValidate>
        {submitError && (
          <div
            role="alert"
            className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400"
          >
            {submitError}
          </div>
        )}

        {/* Definition selector (only when not opened from a row) */}
        {!definition && (
          <div>
            <label htmlFor="register-definition" className={LABEL_CLS}>
              {get(dictionary, 'selectDefinition')}
            </label>
            <select
              id="register-definition"
              className={SELECT_CLS}
              value={selectedDefinitionId}
              onChange={(event) => setSelectedDefinitionId(event.target.value)}
            >
              <option value="" disabled className="bg-slate-800">
                {get(dictionary, 'selectDefinition')}
              </option>
              {definitions.map((item) => (
                <option key={item.id} value={item.id} className="bg-slate-800">
                  {item.name} ({item.currency})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Amount */}
        <div>
          <label htmlFor="register-amount" className={LABEL_CLS}>
            {get(dictionary, 'amount')}
            {activeDefinition && (
              <span className="text-slate-500 font-normal lowercase ml-1">
                ({activeDefinition.currency})
              </span>
            )}
          </label>
          <FormattedNumericInput
            id="register-amount"
            value={amountCents}
            onChange={(value) => {
              setAmountCents(value);
              setValue('amountCents', value, { shouldValidate: true });
            }}
            locale={locale}
            aria-invalid={!!errors.amountCents}
            aria-describedby={errors.amountCents ? 'register-amount-error' : undefined}
            className={`${INPUT_CLS} font-mono tabular-nums`}
          />
          {errors.amountCents && (
            <p id="register-amount-error" role="alert" className={ERROR_CLS}>
              {errors.amountCents.message}
            </p>
          )}
        </div>

        {/* Source account */}
        <div>
          <label htmlFor="register-account" className={LABEL_CLS}>
            {get(dictionary, 'sourceAccount')}
          </label>
          <AccountSelect
            id="register-account"
            value={selectedAccountId ?? ''}
            onChange={(accountId) => setValue('accountId', accountId, { shouldValidate: true })}
            placeholder={get(transactionsDictionary, 'selectAccount')}
            accountsGroupLabel={get(transactionsDictionary, 'accountsGroup')}
            creditCardsGroupLabel={get(transactionsDictionary, 'creditCardsGroup')}
            pocketsGroupLabel={get(transactionsDictionary, 'pocketsGroup')}
            parentNameById={parentNameById}
            accounts={bankAccountOptions}
            creditCards={creditCardOptions}
            pockets={pocketOptions}
            showBalance
            disabled={!activeDefinition || !assetsLoaded}
            locale={locale}
            hasError={!!errors.accountId}
            ariaDescribedBy={errors.accountId ? 'register-account-error' : undefined}
          />
          {errors.accountId && (
            <p id="register-account-error" role="alert" className={ERROR_CLS}>
              {get(dictionary, 'errors.selectAccount')}
            </p>
          )}
          {currencyNotice && (
            <output className="mt-1.5 block text-xs text-amber-400">{currencyNotice}</output>
          )}
        </div>

        {/* Date */}
        <div>
          <label htmlFor="register-date" className={LABEL_CLS}>
            {get(dictionary, 'date')}
          </label>
          <input id="register-date" type="date" className={INPUT_CLS} {...register('date')} />
        </div>

        {/* Notes */}
        <div>
          <label htmlFor="register-notes" className={LABEL_CLS}>
            {get(dictionary, 'notes')}
          </label>
          <textarea
            id="register-notes"
            rows={2}
            className={`${INPUT_CLS} resize-none`}
            {...register('notes', { setValueAs: (value: string) => value || undefined })}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm font-semibold text-slate-300 hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/70"
          >
            {get(dictionary, 'cancel')}
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !activeDefinition || accountsForCurrency.length === 0}
            aria-busy={isSubmitting}
            className="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/70"
          >
            {isSubmitting ? (
              <>{get(dictionary, 'loading')}</>
            ) : (
              <>
                <Check className="w-4 h-4" aria-hidden="true" />
                {get(dictionary, 'confirmRegister')}
              </>
            )}
          </button>
        </div>
      </form>
    </VariableExpenseDialog>
  );
}
