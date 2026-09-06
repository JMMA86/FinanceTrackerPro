'use client';

import { useState, useRef, useEffect } from 'react';
import { Plus, CreditCard as CreditCardIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useUIStore } from '@/store/ui.store';
import { get } from '@/lib/i18n';
import { CreditCardCard } from './CreditCardCard';
import { CreditCardDetail } from './CreditCardDetail';
import { CreateCreditCardModal } from './CreateCreditCardModal';
import { EditCreditCardModal } from './EditCreditCardModal';
import { DeleteCreditCardModal } from './DeleteCreditCardModal';
import { PayCreditCardModal } from './PayCreditCardModal';
import type { CreditCard } from './credit-card.types';

interface CreditCardsSectionProps {
  cards: CreditCard[];
  dictionary: Record<string, unknown>;
  locale?: string;
}

function animateCardDeletion(cardId: string, onDone: () => void) {
  const cardEl = document.querySelector<HTMLElement>(`[data-card-id="${cardId}"]`);
  if (!cardEl) {
    onDone();
    return;
  }

  const FADE_MS = 400;
  const COLLAPSE_MS = 360;
  const EASE_OUT = 'cubic-bezier(0.4, 0, 1, 1)';
  const EASE_INOUT = 'cubic-bezier(0.4, 0, 0.2, 1)';

  cardEl.style.transition = `opacity ${FADE_MS}ms ${EASE_OUT}, transform ${FADE_MS}ms ${EASE_OUT}`;
  cardEl.style.opacity = '0';
  cardEl.style.transform = 'scale(0.93) translateY(-10px)';

  setTimeout(() => {
    const gridEl = cardEl.parentElement;
    if (gridEl) {
      const cardTop = cardEl.offsetTop;
      const siblings = Array.from(gridEl.children) as HTMLElement[];
      const isAloneInRow = siblings.every((s) => s === cardEl || s.offsetTop !== cardTop);

      if (isAloneInRow) {
        const cardHeight = cardEl.offsetHeight;
        cardEl.style.overflow = 'hidden';
        cardEl.style.height = `${cardHeight}px`;
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        cardEl.offsetHeight; // force reflow
        cardEl.style.transition = `height ${COLLAPSE_MS}ms ${EASE_INOUT}`;
        cardEl.style.height = '0';
      }
    }
    setTimeout(onDone, COLLAPSE_MS + 20);
  }, FADE_MS + 20);
}

export function CreditCardsSection({
  cards,
  dictionary,
  locale,
}: Readonly<CreditCardsSectionProps>) {
  const router = useRouter();
  const openModal = useUIStore((s) => s.openModal);
  const pendingDeleteId = useRef<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cardRect, setCardRect] = useState<DOMRect | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [payCard, setPayCard] = useState<CreditCard | null>(null);

  useEffect(() => {
    const onDeleted = (e: Event) => {
      pendingDeleteId.current = (e as CustomEvent<{ cardId: string }>).detail.cardId;
    };
    document.addEventListener('finance:credit-card-deleted', onDeleted);
    return () => document.removeEventListener('finance:credit-card-deleted', onDeleted);
  }, []);

  const selectedCard = cards.find((c) => c.id === selectedId) ?? null;

  function handleSelect(id: string, rect: DOMRect) {
    if (isDetailOpen) return;
    setSelectedId(id);
    setCardRect(rect);
    setIsDetailOpen(true);
  }

  function handleClose() {
    setIsDetailOpen(false);
    setSelectedId(null);
    setCardRect(null);

    const deletedId = pendingDeleteId.current;
    pendingDeleteId.current = null;

    if (deletedId) {
      animateCardDeletion(deletedId, () => router.refresh());
    } else {
      router.refresh();
    }
  }

  function handleOpenPay(card: CreditCard) {
    setPayCard(card);
  }

  return (
    <>
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">{get(dictionary, 'sections')}</h2>
          <button
            type="button"
            onClick={() => openModal('create-credit-card')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            {get(dictionary, 'addCard')}
          </button>
        </div>

        {cards.length === 0 ? (
          <div className="app-shell rounded-2xl py-12 flex flex-col items-center gap-4 text-center">
            <div className="p-4 rounded-2xl bg-blue-600/10 text-blue-400">
              <CreditCardIcon className="w-8 h-8" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white mb-1">{get(dictionary, 'noCards')}</p>
              <p className="text-xs text-slate-400 max-w-xs">{get(dictionary, 'noCardsDesc')}</p>
            </div>
            <button
              type="button"
              onClick={() => openModal('create-credit-card')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              {get(dictionary, 'addCard')}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cards.map((card) => (
              <CreditCardCard
                key={card.id}
                card={card}
                isAnySelected={isDetailOpen}
                dictionary={dictionary}
                locale={locale}
                onSelect={handleSelect}
              />
            ))}
          </div>
        )}
      </section>

      <CreditCardDetail
        card={selectedCard}
        cardRect={cardRect}
        isOpen={isDetailOpen}
        dictionary={dictionary}
        locale={locale}
        onClose={handleClose}
        onEdit={(cardId) => openModal('edit-credit-card', { cardId })}
        onPay={handleOpenPay}
        onDelete={(cardId, cardName, debtCents, currency) =>
          openModal('delete-credit-card', { cardId, cardName, debtCents, currency })
        }
      />

      <CreateCreditCardModal dictionary={dictionary} />
      <EditCreditCardModal cards={cards} dictionary={dictionary} />
      <DeleteCreditCardModal dictionary={dictionary} locale={locale} />
      <PayCreditCardModal
        open={payCard !== null}
        cards={cards}
        initialCardId={payCard?.id}
        dictionary={dictionary}
        locale={locale}
        onClose={() => setPayCard(null)}
      />
    </>
  );
}
