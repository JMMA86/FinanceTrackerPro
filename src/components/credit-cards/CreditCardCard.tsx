'use client';

import { useRef } from 'react';
import { formatMoney } from '@/lib/money';
import { get } from '@/lib/i18n';
import { getPresetGradient, LIGHT_PRESET_KEYS } from '@/components/accounts/CardDesignPicker';
import { NetworkLogo } from '@/components/accounts/AccountCard';
import type { CardNetwork } from '@/components/accounts/AccountCard';
import type { CreditCard } from './credit-card.types';

const CREDIT_DEFAULT_GRADIENT = 'linear-gradient(135deg, #dc2626, #7f1d1d)';

export function getCardBackground(card: CreditCard): React.CSSProperties {
  return {
    background:
      (card.cardColor ? getPresetGradient(card.cardColor) : undefined) ?? CREDIT_DEFAULT_GRADIENT,
  };
}

export function isLightCreditCard(card: CreditCard): boolean {
  return card.cardColor != null && LIGHT_PRESET_KEYS.has(card.cardColor);
}

interface CreditCardCardProps {
  card: CreditCard;
  dictionary: Record<string, unknown>;
  locale?: string;
  onSelect: (cardId: string, rect: DOMRect) => void;
  isAnySelected?: boolean;
}

export function CreditCardCard({
  card,
  dictionary,
  locale = 'es-CO',
  onSelect,
  isAnySelected = false,
}: Readonly<CreditCardCardProps>) {
  const cardRef = useRef<HTMLDivElement>(null);
  const network = (card.cardNetwork ?? 'NONE') as CardNetwork;
  const light = isLightCreditCard(card);

  const textColor = light ? 'text-slate-800' : 'text-white';
  const shadow = light ? '0 1px 2px rgba(255,255,255,0.6)' : '0 1px 3px rgba(0,0,0,0.5)';
  const badgeBg = light ? 'bg-slate-800/15 backdrop-blur-sm' : 'bg-white/20 backdrop-blur-sm';

  function handleClick() {
    if (!cardRef.current) return;
    onSelect(card.id, cardRef.current.getBoundingClientRect());
  }

  return (
    <div className="group" ref={cardRef} data-card-id={card.id}>
      <button
        type="button"
        onClick={handleClick}
        aria-label={card.name}
        className={[
          'w-full text-left rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
          'transition-all duration-300 ease-out',
          isAnySelected ? 'opacity-40 scale-[0.97]' : 'hover:scale-[1.02] hover:shadow-2xl',
        ].join(' ')}
      >
        <div
          className="relative w-full rounded-2xl shadow-xl overflow-hidden"
          style={{ aspectRatio: '1.586', ...getCardBackground(card) }}
        >
          {/* Subtle light sweep on hover */}
          <div
            className="absolute inset-0 z-20 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500"
            style={{
              background:
                'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.08) 50%, transparent 70%)',
            }}
            aria-hidden="true"
          />

          <div
            className={`relative z-10 flex flex-col justify-between p-5 h-full ${textColor}`}
            style={{ textShadow: shadow }}
          >
            <div className="flex items-start justify-between">
              {/* Chip with shimmer highlight */}
              <svg width="40" height="28" viewBox="0 0 40 28" fill="none" aria-hidden="true">
                <rect width="40" height="28" rx="4" fill="#c9a84c" opacity="0.85" />
                <rect x="0" y="10" width="40" height="8" fill="#8a6b1e" opacity="0.55" />
                <rect x="13" y="0" width="14" height="28" fill="#8a6b1e" opacity="0.35" />
                <rect x="13" y="10" width="14" height="8" rx="1" fill="#8a6b1e" opacity="0.5" />
                <rect x="2" y="2" width="36" height="5" rx="2" fill="white" opacity="0.15" />
              </svg>
              <span
                className={`text-[10px] font-semibold uppercase tracking-wider ${badgeBg} px-2 py-0.5 rounded-md`}
              >
                {get(dictionary, 'cardTypeBadge')}
              </span>
            </div>

            <div className="flex items-end justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold opacity-90 truncate">{card.name}</p>
                <p className="text-[10px] font-medium opacity-70 uppercase tracking-wider pt-0.5">
                  {get(dictionary, 'debt')}
                </p>
                <p className="text-xl font-bold tracking-tight leading-none">
                  {formatMoney(card.debtCents, card.currency, locale)}
                </p>
                <p className="text-[11px] font-medium opacity-75 pt-0.5">
                  {get(dictionary, 'available')}:{' '}
                  {card.availableCreditCents != null
                    ? formatMoney(card.availableCreditCents, card.currency, locale)
                    : '—'}
                </p>
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
