import { get } from '@/lib/i18n';

/**
 * Maps the English Zod messages emitted by Server Action schemas to the
 * `validation.*` i18n keys, so the UI can render them in the active locale.
 */
const EN_TO_KEY: Record<string, string> = {
  'Name is required': 'validation.nameRequired',
  'Name too long': 'validation.nameTooLong',
  'Amount must be an integer (cents)': 'validation.amountInteger',
  'Amount must be a whole number': 'validation.amountWhole',
  'Amount must be positive': 'validation.amountPositive',
  'Amount must be greater than 0': 'validation.amountPositive',
  'Amount exceeds maximum safe value': 'validation.amountMax',
  'Amount must be at least 1 cent': 'validation.amountMin',
  'Interest rate cannot be negative': 'validation.rateNegative',
  'Interest rate exceeds the allowed maximum': 'validation.rateMax',
  'Term count must be an integer': 'validation.termInteger',
  'Term count must be at least 1': 'validation.termMin',
  'Term count exceeds the allowed maximum': 'validation.termMax',
  'First payment date must be after the start date': 'validation.firstPaymentAfterStart',
  'termCount is required when scheduleMode is TERM': 'validation.termRequired',
  'installmentAmountCents is required (and amortizationType must be FRENCH without customTotals) when scheduleMode is INSTALLMENT':
    'validation.installmentRequired',
  'Interest-only installments must be less than the term count':
    'validation.interestOnlyLessThanTerm',
  'The installment must cover interest, amortize the principal and keep the derived term count within the allowed maximum':
    'validation.installmentCoversInterest',
  'customTotals with one entry per installment is required for CUSTOM amortization':
    'validation.customTotalsRequired',
  'Must be a valid CUID': 'validation.validCuid',
  'Must be a valid UUID v4': 'validation.validUuid',
  'amountCents is required for this adjustment type': 'validation.amountRequired',
  'newRateValue is required for RATE_CHANGE': 'validation.newRateRequired',
  'newTermCount is required for RESCHEDULE': 'validation.newTermRequired',
  'installmentNumber and amountCents are required for CUSTOM_INSTALLMENT':
    'validation.customInstallmentRequired',
  'installmentNumber is required for INTEREST_ONLY_PERIOD': 'validation.installmentNumberRequired',
  'Select a transaction type': 'validation.selectType',
  'Select an account': 'validation.selectAccount',
  'Description is too long': 'validation.descriptionTooLong',
  'Description too long': 'validation.descriptionTooLong',
};

const KEY_TO_EN: Record<string, string> = Object.fromEntries(
  Object.entries(EN_TO_KEY).map(([en, key]) => [key, en])
);

/**
 * Resolves a validation message coming from Zod (either a `validation.*` key or
 * a known English string) against the provided dictionary.
 *
 * `safeAction` wraps Zod issues as `"field: message"` (e.g.
 * `"name: validation.nameRequired"`), so the field prefix is stripped before
 * resolving. Unknown messages are returned untouched.
 */
export function translateValidationMessage(
  message: string | undefined | null,
  dictionary: Record<string, unknown>
): string {
  if (!message) return '';
  let candidate = message;
  // safeAction envuelve como "campo: mensaje" o "campo.sub: mensaje"
  const sep = message.indexOf(': ');
  if (sep > 0 && /^[\w.[\]]+$/.test(message.slice(0, sep))) candidate = message.slice(sep + 2);
  const key = candidate.startsWith('validation.') ? candidate : EN_TO_KEY[candidate];
  if (!key) return message;
  const translated = get(dictionary, key);
  if (translated && translated !== key) return translated;
  return KEY_TO_EN[key] ?? message;
}
