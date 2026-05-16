'use client';

import { useRef } from 'react';
import { formatMoney } from '@/lib/money';
import { get } from '@/lib/i18n';
import { getPresetGradient, LIGHT_PRESET_KEYS } from './CardDesignPicker';

export const TYPE_GRADIENTS: Record<string, string> = {
  CHECKING: 'linear-gradient(135deg, #1d4ed8, #1e3a8a)',
  CASH:     'linear-gradient(135deg, #059669, #065f46)',
  SAVINGS:  'linear-gradient(135deg, #7c3aed, #4c1d95)',
  POCKET:   'linear-gradient(135deg, #d97706, #92400e)',
};

export const TYPE_LABELS: Record<string, string> = {
  CHECKING: 'Corriente', CASH: 'Efectivo', SAVINGS: 'Ahorros', POCKET: 'Bolsillo',
};

export type CardNetwork = 'NONE' | 'VISA' | 'MASTERCARD' | 'AMEX';

function VisaLogo({ className, onLight }: Readonly<{ className: string; onLight?: boolean }>) {
  return (
    <svg viewBox="0 0 60 22" className={className} aria-label="Visa">
      <text x="0" y="18" fontFamily="Arial, sans-serif" fontSize="22" fontWeight="900"
        fontStyle="italic" fill={onLight ? '#1e293b' : 'white'} letterSpacing="-1">VISA</text>
    </svg>
  );
}

function MastercardLogo({ className }: Readonly<{ className: string }>) {
  return (
    <svg viewBox="0 0 46 30" className={className} aria-label="Mastercard">
      <circle cx="15" cy="15" r="15" fill="#EB001B"/>
      <circle cx="31" cy="15" r="15" fill="#F79E1B" opacity="0.9"/>
    </svg>
  );
}

function AmexLogo({ className, onLight }: Readonly<{ className: string; onLight?: boolean }>) {
  const ink = onLight ? '#1e293b' : 'white';
  return (
    <svg viewBox="0 0 52 22" className={className} aria-label="American Express">
      <rect width="52" height="22" rx="3" fill={ink} opacity={onLight ? 0.12 : 0.25}/>
      <text x="4" y="16" fontFamily="Arial, sans-serif" fontSize="13" fontWeight="800"
        fill={ink} letterSpacing="1.5">AMEX</text>
    </svg>
  );
}

export function isLightCard(account: AccountCardData): boolean {
  return account.cardColor != null && LIGHT_PRESET_KEYS.has(account.cardColor);
}

export function NetworkLogo({ network, size = 'md', onLight }: Readonly<{ network: CardNetwork; size?: 'sm' | 'md'; onLight?: boolean }>) {
  const visa = size === 'sm' ? 'h-5 w-auto' : 'h-8 w-auto';
  const mc   = size === 'sm' ? 'h-6 w-auto' : 'h-9 w-auto';
  const amex = size === 'sm' ? 'h-5 w-auto' : 'h-8 w-auto';
  if (network === 'VISA') return <VisaLogo className={visa} onLight={onLight} />;
  if (network === 'MASTERCARD') return <MastercardLogo className={mc} />;
  if (network === 'AMEX') return <AmexLogo className={amex} onLight={onLight} />;
  return null;
}

export interface AccountCardData {
  id: string;
  name: string;
  type: string;
  currency: string;
  balanceCents: number;
  interestRateEA: number | null;
  parentAccountId: string | null;
  cardColor: string | null;
  cardNetwork: string | null;
  createdAt: Date | string;
  transactions: Array<{
    id: string;
    description: string | null;
    amountCents: number;
    currency: string;
    type: string;
    date: Date | string;
  }>;
}

interface AccountCardProps {
  account: AccountCardData;
  parentName?: string;
  isAnySelected?: boolean;
  dictionary: Record<string, unknown>;
  locale?: string;
  onSelect: (accountId: string, rect: DOMRect) => void;
}

export function getCardBackground(account: AccountCardData): React.CSSProperties {
  return {
    background:
      (account.cardColor ? getPresetGradient(account.cardColor) : undefined) ??
      TYPE_GRADIENTS[account.type] ??
      'linear-gradient(135deg, #475569, #1e293b)',
  };
}

export function AccountCard({
  account, parentName, isAnySelected = false, dictionary, locale = 'es-CO', onSelect,
}: Readonly<AccountCardProps>) {
  const cardRef = useRef<HTMLDivElement>(null);
  const rateNumber = account.interestRateEA == null ? null : Number(account.interestRateEA);
  const showRate = rateNumber !== null && rateNumber > 0;
  const network = (account.cardNetwork ?? 'NONE') as CardNetwork;

  function handleClick() {
    if (!cardRef.current) return;
    onSelect(account.id, cardRef.current.getBoundingClientRect());
  }

  const light = isLightCard(account);
  const textColor = light ? 'text-slate-800' : 'text-white';
  const shadow = light ? '0 1px 2px rgba(255,255,255,0.6)' : '0 1px 3px rgba(0,0,0,0.5)';
  const badgeBg = light ? 'bg-slate-800/15 backdrop-blur-sm' : 'bg-white/20 backdrop-blur-sm';

  return (
    <div className="group" ref={cardRef} data-account-id={account.id}>
      {parentName && (
        <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1.5 px-1">
          {get(dictionary, 'pocketOf')} {parentName}
        </p>
      )}

      <button
        type="button"
        onClick={handleClick}
        aria-label={account.name}
        className={[
          'w-full text-left rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
          'transition-all duration-300 ease-out',
          isAnySelected ? 'opacity-40 scale-[0.97]' : 'hover:scale-[1.02] hover:brightness-105',
        ].join(' ')}
      >
        <div
          className="relative w-full rounded-2xl shadow-xl overflow-hidden"
          style={{ aspectRatio: '1.586', ...getCardBackground(account) }}
        >
          <div
            className={`relative z-10 flex flex-col justify-between p-5 h-full ${textColor}`}
            style={{ textShadow: shadow }}
          >
            <div className="flex items-start justify-between">
              <svg width="40" height="28" viewBox="0 0 40 28" fill="none" aria-hidden="true">
                <rect width="40" height="28" rx="4" fill="#D4AF37" opacity="0.9"/>
                <rect x="0" y="9" width="40" height="10" fill="#B8960C" opacity="0.6"/>
                <rect x="13" y="0" width="14" height="28" fill="#B8960C" opacity="0.4"/>
              </svg>
              <span className={`text-[10px] font-semibold uppercase tracking-wider ${badgeBg} px-2 py-0.5 rounded-full`}>
                {TYPE_LABELS[account.type] ?? account.type}
              </span>
            </div>

            <div className="flex items-end justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold opacity-90 truncate">{account.name}</p>
                <p className="text-xl font-bold tracking-tight leading-none">
                  {formatMoney(account.balanceCents, account.currency, locale)}
                </p>
                {showRate && (
                  <p className="text-[11px] font-medium opacity-70 pt-0.5">
                    {rateNumber.toFixed(2)}% EA
                  </p>
                )}
              </div>
              {network !== 'NONE' && (
                <div className="flex-shrink-0">
                  <NetworkLogo network={network} onLight={light} />
                </div>
              )}
            </div>
          </div>
        </div>
      </button>
    </div>
  );
}
