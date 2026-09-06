'use client';

import { get } from '@/lib/i18n';
import { NetworkLogo } from '@/components/accounts/AccountCard';
import type { CardNetwork } from '@/components/accounts/AccountCard';

const NETWORKS: { value: CardNetwork; labelKey: string }[] = [
  { value: 'NONE', labelKey: 'networks.NONE' },
  { value: 'VISA', labelKey: 'visa' },
  { value: 'MASTERCARD', labelKey: 'mastercard' },
  { value: 'AMEX', labelKey: 'amex' },
];

interface NetworkPickerProps {
  value: CardNetwork;
  onChange: (network: CardNetwork) => void;
  dictionary: Record<string, unknown>;
}

/**
 * Card network selector (NONE / VISA / MASTERCARD / AMEX) shared by the
 * account and credit-card modals.
 */
export function NetworkPicker({ value, onChange, dictionary }: Readonly<NetworkPickerProps>) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {NETWORKS.map(({ value: networkValue, labelKey }) => (
        <button
          key={networkValue}
          type="button"
          onClick={() => onChange(networkValue)}
          aria-pressed={value === networkValue}
          className={`flex flex-col items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs font-medium transition-all ${
            value === networkValue
              ? 'border-blue-500/60 bg-blue-500/15 text-white'
              : 'border-white/10 bg-white/4 text-slate-400 hover:border-white/20'
          }`}
        >
          {networkValue === 'NONE' ? (
            <span className="text-base">—</span>
          ) : (
            <span className="h-4 flex items-center">
              <NetworkLogo network={networkValue} size="sm" />
            </span>
          )}
          <span className="text-[10px]">{get(dictionary, labelKey)}</span>
        </button>
      ))}
    </div>
  );
}
