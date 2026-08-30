'use client';

/**
 * ToastViewport — Global notification renderer.
 *
 * Reads `notifications` from the UI store (which are pushed by callers via
 * `addNotification`) and renders them as non-blocking toasts. This is the ONLY
 * place where notifications become visible in the DOM.
 *
 * A11y: the fixed container is an `aria-live="polite"` region (`role="status"`)
 * so screen readers announce newly added notifications (WCAG 4.1.3).
 *
 * The store auto-removes notifications after 5s (setTimeout inside
 * `addNotification`). The close button here only accelerates dismissal and
 * plays a short exit transition before removing the toast from the store.
 */

import { useCallback, useState } from 'react';
import { X, CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react';
import { useUIStore } from '@/store/ui.store';
import type { UIState } from '@/store/ui.store';

type Notification = UIState['notifications'][0];
type NotificationType = Notification['type'];

interface TypeStyle {
  icon: typeof CheckCircle2;
  container: string;
  iconColor: string;
}

const TYPE_STYLES: Record<NotificationType, TypeStyle> = {
  success: {
    icon: CheckCircle2,
    container: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200',
    iconColor: 'text-emerald-400',
  },
  error: {
    icon: XCircle,
    container: 'bg-rose-500/10 border-rose-500/30 text-rose-200',
    iconColor: 'text-rose-400',
  },
  warning: {
    icon: AlertTriangle,
    container: 'bg-amber-500/10 border-amber-500/30 text-amber-200',
    iconColor: 'text-amber-400',
  },
  info: {
    icon: Info,
    container: 'bg-blue-500/10 border-blue-500/30 text-blue-200',
    iconColor: 'text-blue-400',
  },
};

/** Duration of the exit transition before a manually dismissed toast leaves the store. */
const EXIT_ANIMATION_MS = 200;

export function ToastViewport() {
  const notifications = useUIStore((s) => s.notifications);
  const removeNotification = useUIStore((s) => s.removeNotification);
  const [exitingIds, setExitingIds] = useState<ReadonlySet<string>>(new Set());

  const dismiss = useCallback(
    (id: string) => {
      setExitingIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });

      window.setTimeout(() => {
        removeNotification(id);
        setExitingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, EXIT_ANIMATION_MS);
    },
    [removeNotification]
  );

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="false"
      className="fixed top-4 right-4 z-[100] flex flex-col items-end gap-2 pointer-events-none"
    >
      {notifications.map((notification) => {
        const style = TYPE_STYLES[notification.type];
        const Icon = style.icon;
        const isExiting = exitingIds.has(notification.id);

        return (
          <div
            key={notification.id}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 shadow-2xl backdrop-blur-md transition-all duration-200 ease-out animate-slideUp ${
              isExiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'
            } ${style.container}`}
          >
            <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${style.iconColor}`} aria-hidden="true" />
            <p className="flex-1 min-w-0 text-sm font-medium leading-snug">
              {notification.message}
            </p>
            <button
              type="button"
              onClick={() => dismiss(notification.id)}
              aria-label="Cerrar notificación"
              className="shrink-0 p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
