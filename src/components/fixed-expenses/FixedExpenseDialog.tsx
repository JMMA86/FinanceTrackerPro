'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { get } from '@/lib/i18n';

interface FixedExpenseDialogProps {
  open: boolean;
  /** Id used for aria-labelledby and the heading element. */
  titleId: string;
  title: ReactNode;
  dictionary: Record<string, unknown>;
  onClose: () => void;
  /** Tailwind width class for the panel (default 'max-w-lg'). */
  maxWidth?: string;
  /** Dialog body — typically the form. Cancel buttons call the parent onClose. */
  children: ReactNode;
}

/**
 * Shared dialog shell for the fixed-expenses modals.
 *
 * Encapsulates the native <dialog> + animated backdrop + panel + header used by
 * every modal, moving focus to the visible heading on open (the backdrop is a
 * non-focusable aria-hidden element) and animating the close. Callers receive a
 * `close()` trigger so Cancel buttons share the same fade-out.
 */
export function FixedExpenseDialog({
  open,
  titleId,
  title,
  dictionary,
  onClose,
  maxWidth = 'max-w-lg',
  children,
}: Readonly<FixedExpenseDialogProps>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      dialog.showModal();
      // Native showModal focuses the backdrop first; land on the heading instead
      // (WCAG 2.4.3 Focus Order — no phantom focus).
      dialog.querySelector<HTMLElement>('[data-modal-heading]')?.focus();
      const id = requestAnimationFrame(() => setIsVisible(true));
      return () => cancelAnimationFrame(id);
    }
    if (dialog.open) {
      setIsVisible(false);
      const timer = setTimeout(() => {
        if (dialog.open) dialog.close();
      }, 240);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [open]);

  const close = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog?.open) return;
    setIsVisible(false);
    setTimeout(() => {
      if (dialog.open) dialog.close();
    }, 240);
  }, []);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby={titleId}
      className="bg-transparent border-none m-0 h-full w-full max-w-full max-h-full backdrop:bg-transparent open:flex items-center justify-center p-4"
    >
      {/* Non-focusable backdrop: click-to-close only (X, Cancel and Esc remain).
          aria-hidden keeps it out of the accessibility tree and tab order. */}
      <div
        aria-hidden="true"
        onClick={close}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        style={{ opacity: isVisible ? 1 : 0, transition: 'opacity 220ms ease' }}
      />

      <div
        className={`relative w-full ${maxWidth} bg-slate-900 border border-white/10 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto`}
        style={{
          transform: isVisible ? 'scale(1) translateY(0)' : 'scale(0.93) translateY(12px)',
          opacity: isVisible ? 1 : 0,
          transition: isVisible
            ? 'transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 200ms cubic-bezier(0.4, 0, 0.2, 1)'
            : 'transform 200ms cubic-bezier(0.4, 0, 0.2, 1), opacity 180ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 sticky top-0 bg-slate-900 z-10">
          <h2
            id={titleId}
            data-modal-heading
            tabIndex={-1}
            className="text-base font-semibold text-white focus:outline-none"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label={get(dictionary, 'close')}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/8 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="px-6 py-5">{children}</div>
      </div>
    </dialog>
  );
}
