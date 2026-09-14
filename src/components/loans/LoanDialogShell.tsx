'use client';

import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { X } from 'lucide-react';

const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
const EASE_OUT = 'cubic-bezier(0.4, 0, 0.2, 1)';
/** Exit delay (ms) kept in sync with the panel exit transition. */
const EXIT_MS = 240;

const DIALOG_CLS =
  'bg-transparent border-none m-0 h-full w-full max-w-full max-h-full backdrop:bg-transparent open:flex items-center justify-center p-4';
const DEFAULT_HEADER_CLS =
  'flex items-center justify-between px-6 py-4 border-b border-white/8 sticky top-0 bg-slate-900 z-10';
const CLOSE_BTN_CLS =
  'p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/8 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70';

/** Imperative handle exposed to the modal that owns the shell. */
export interface LoanDialogRenderApi {
  /** Closes the dialog with the shared exit animation. */
  close: () => void;
}

interface LoanDialogShellProps {
  isOpen: boolean;
  /** Notified when the dialog emits its native `close` event (and after `close()`). */
  onClose: () => void;
  /** i18n label for the header close button. */
  closeLabel: string;
  /** When provided, renders the shared header (title + close button). */
  title?: string;
  /** Id used for `aria-labelledby` and the header `<h2>`; also the focus target. */
  titleId?: string;
  /** Extra header content rendered inside the `<h2>` after the title (e.g. badges). */
  headerSlot?: React.ReactNode;
  /** Tailwind width class for the panel (default `max-w-lg`). */
  maxWidthClass?: string;
  /** Extra classes appended to the panel. */
  panelClassName?: string;
  /** Override for the sticky header classes. */
  headerClassName?: string;
  /** Backdrop tint class (default `bg-black/60`). */
  backdropClassName?: string;
  /** Backdrop click handler; defaults to the animated `close()`. */
  onBackdropClick?: () => void;
  /** Cleanup (e.g. clearing an error) run before every close. */
  onBeforeClose?: () => void;
  /** `lang` attribute forwarded to the native `<dialog>` (detail modal). */
  lang?: string;
  /** Imperative handle so in-body actions (Cancel, etc.) animate the close. */
  closeRef?: React.RefObject<LoanDialogRenderApi | null>;
  /** Dialog body. */
  children: React.ReactNode;
  /** Optional footer actions rendered after the body. */
  footer?: React.ReactNode;
}

/**
 * Shared native `<dialog>` shell for the loan modals.
 *
 * Encapsulates the duplicated boilerplate: `showModal`/`close`, the 240ms
 * opacity/scale entrance + exit animation, the transparent backdrop, the panel
 * container, the sticky header (title + close button) and the optional footer.
 * Each modal only supplies its title, body and (optionally) footer/header slot.
 *
 * `onClose` fires both on user-initiated closes (X, backdrop) and on the native
 * `close` event, preserving the previous "submit + native close" semantics that
 * the grids already coalesce.
 */
export function LoanDialogShell({
  isOpen,
  onClose,
  closeLabel,
  title,
  titleId,
  headerSlot,
  maxWidthClass = 'max-w-lg',
  panelClassName = '',
  headerClassName = DEFAULT_HEADER_CLS,
  backdropClassName = 'bg-black/60',
  onBackdropClick,
  onBeforeClose,
  lang,
  closeRef,
  children,
  footer,
}: Readonly<LoanDialogShellProps>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen) {
      dialog.showModal();
      // Native showModal focuses the FIRST focusable element, which is the
      // (aria-hidden) backdrop. Move focus to the dialog heading instead.
      dialog.querySelector<HTMLElement>('[data-modal-heading]')?.focus();
      const id = requestAnimationFrame(() => setIsVisible(true));
      return () => cancelAnimationFrame(id);
    }
    if (dialog.open) {
      setIsVisible(false);
      const timer = setTimeout(() => {
        if (dialog.open) dialog.close();
      }, EXIT_MS);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isOpen]);

  const close = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog?.open) return;
    onBeforeClose?.();
    setIsVisible(false);
    setTimeout(() => {
      if (dialog.open) dialog.close();
    }, EXIT_MS);
  }, [onBeforeClose]);

  useImperativeHandle(closeRef, () => ({ close }), [close]);

  const handleDialogClose = useCallback(() => {
    onBeforeClose?.();
    onClose();
  }, [onBeforeClose, onClose]);

  return (
    <dialog
      ref={dialogRef}
      onClose={handleDialogClose}
      aria-labelledby={titleId}
      lang={lang}
      className={DIALOG_CLS}
    >
      {/* Non-focusable backdrop: click-to-close only (X, Cancel and Esc remain). */}
      <div
        aria-hidden="true"
        onClick={onBackdropClick ?? close}
        className={`fixed inset-0 ${backdropClassName} backdrop-blur-sm`}
        style={{ opacity: isVisible ? 1 : 0, transition: 'opacity 220ms ease' }}
      />

      <div
        className={`relative w-full ${maxWidthClass} bg-slate-900 border border-white/10 rounded-2xl shadow-2xl ${panelClassName}`}
        style={{
          transform: isVisible ? 'scale(1) translateY(0)' : 'scale(0.93) translateY(12px)',
          opacity: isVisible ? 1 : 0,
          transition: isVisible
            ? `transform 280ms ${SPRING}, opacity 200ms ${EASE_OUT}`
            : `transform 200ms ${EASE_OUT}, opacity 180ms ${EASE_OUT}`,
        }}
      >
        {title != null && (
          <div className={headerClassName}>
            <h2
              id={titleId}
              data-modal-heading
              tabIndex={-1}
              className="text-base font-semibold text-white focus:outline-none"
            >
              {title}
              {headerSlot}
            </h2>
            <button type="button" onClick={close} aria-label={closeLabel} className={CLOSE_BTN_CLS}>
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {children}
        {footer}
      </div>
    </dialog>
  );
}
