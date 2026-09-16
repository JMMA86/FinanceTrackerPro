'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { get } from '@/lib/i18n';

const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
const EASE_OUT = 'cubic-bezier(0.4, 0, 0.2, 1)';

interface ModalDialogProps {
  open: boolean;
  /** Id used for aria-labelledby AND the <h2> (form) / the confirm title. */
  titleId: string;
  /** Accessible title. For the confirm variant the child renders the <h2> with `titleId`. */
  title: React.ReactNode;
  dictionary: Record<string, unknown>;
  onClose: () => void;
  variant?: 'form' | 'confirm';
  /** Tailwind width class for the panel (default 'max-w-lg'). */
  maxWidth?: string;
  /** Extra classes appended to the panel. */
  panelClassName?: string;
  children: React.ReactNode;
}

/**
 * Shared dialog shell used by the credit-card modals (and usable elsewhere).
 *
 * Encapsulates the native <dialog> + animated backdrop + panel + header that was
 * previously duplicated across every modal. The open/close animation and the
 * Escape/backdrop close behavior live here; each modal only supplies its title,
 * its form/content and the close callback.
 */
export function ModalDialog({
  open,
  titleId,
  title,
  dictionary,
  onClose,
  variant = 'form',
  maxWidth = 'max-w-lg',
  panelClassName = '',
  children,
}: Readonly<ModalDialogProps>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      dialog.showModal();
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

  const handleClose = () => {
    const dialog = dialogRef.current;
    if (!dialog?.open) return;
    setIsVisible(false);
    setTimeout(() => {
      if (dialog.open) dialog.close();
    }, 240);
  };

  const isConfirm = variant === 'confirm';
  const panelStyle: React.CSSProperties = {
    transform: isVisible ? 'scale(1) translateY(0)' : 'scale(0.93) translateY(12px)',
    opacity: isVisible ? 1 : 0,
    transition: isVisible
      ? `transform 280ms ${SPRING}, opacity 200ms ${EASE_OUT}`
      : `transform 200ms ${EASE_OUT}, opacity 180ms ${EASE_OUT}`,
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby={titleId}
      className="bg-transparent border-none m-0 h-full w-full max-w-full max-h-full backdrop:bg-transparent open:flex items-center justify-center p-4"
    >
      {isConfirm ? (
        <div
          className="fixed inset-0"
          style={{
            backgroundColor: isVisible ? 'rgba(0,0,0,0.60)' : 'rgba(0,0,0,0)',
            backdropFilter: isVisible ? 'blur(4px)' : 'none',
            transition: 'background-color 200ms ease, backdrop-filter 200ms ease',
          }}
          onClick={handleClose}
          aria-hidden="true"
        />
      ) : (
        <button
          type="button"
          aria-label={get(dictionary, 'close')}
          onClick={handleClose}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          style={{ opacity: isVisible ? 1 : 0, transition: 'opacity 220ms ease' }}
        />
      )}

      <div
        style={panelStyle}
        className={`relative w-full ${maxWidth} bg-slate-900 border border-white/10 rounded-2xl shadow-2xl ${
          isConfirm ? 'overflow-hidden' : 'max-h-[90vh] overflow-y-auto'
        } ${panelClassName}`}
      >
        {isConfirm ? (
          <>
            <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-rose-500/20 to-transparent" />
            <button
              type="button"
              onClick={handleClose}
              aria-label={get(dictionary, 'close')}
              className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/8 transition-colors z-10"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="relative px-6 pt-8 pb-6">{children}</div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 sticky top-0 bg-slate-900 z-10">
              <h2 id={titleId} className="text-base font-semibold text-white">
                {title}
              </h2>
              <button
                type="button"
                onClick={handleClose}
                aria-label={get(dictionary, 'close')}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/8 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-5">{children}</div>
          </>
        )}
      </div>
    </dialog>
  );
}
