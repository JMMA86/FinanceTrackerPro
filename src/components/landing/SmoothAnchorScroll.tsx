'use client';

/**
 * SmoothAnchorScroll
 *
 * Headless client component mounted once on the landing page. It intercepts
 * in-page anchor clicks (`a[href^="#"]`) at the document level and animates the
 * scroll with an ease-in-out (cubic) curve instead of the browser's instant
 * jump. It delegates all behaviour through a single effect: no UI, no state and
 * no re-renders.
 *
 * The listener is registered in the capture phase on purpose: Next.js `<Link>`
 * calls `preventDefault()` on its own bubble-phase handler, so a bubble listener
 * would see `event.defaultPrevented === true`. Capturing first lets us prevent
 * the default and makes Next's handler bail out early.
 *
 * Accessibility: when `prefers-reduced-motion: reduce` is set, the native
 * behaviour is left untouched. Otherwise the destination receives focus without
 * scrolling so keyboard and screen-reader users keep their context.
 */

import { useEffect } from 'react';

const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const NAVIGATION_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function SmoothAnchorScroll(): null {
  useEffect(() => {
    let frameId: number | null = null;
    let initialFrameId: number | null = null;
    let removeInterruptListeners: (() => void) | null = null;
    let disposed = false;

    const onNavigationKey = (event: KeyboardEvent) => {
      if (NAVIGATION_KEYS.has(event.key)) {
        stopAnimation();
      }
    };

    const stopAnimation = () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
        frameId = null;
      }
      if (removeInterruptListeners) {
        removeInterruptListeners();
        removeInterruptListeners = null;
      }
    };

    const focusTarget = (element: HTMLElement) => {
      if (element.getAttribute('tabindex') === null) {
        element.setAttribute('tabindex', '-1');
      }
      element.focus({ preventScroll: true });
    };

    const scrollToElement = (element: HTMLElement) => {
      stopAnimation();

      const scrollMarginTop = Number.parseFloat(getComputedStyle(element).scrollMarginTop) || 0;
      const start = window.scrollY;
      const target = element.getBoundingClientRect().top + window.scrollY - scrollMarginTop;
      const distance = target - start;
      const duration = Math.min(900, Math.max(500, Math.abs(distance) * 0.5));

      // Already there (or reduced motion): jump immediately and keep focus.
      if (distance === 0) {
        window.scrollTo(0, target);
        focusTarget(element);
        return;
      }

      focusTarget(element);

      const interrupt = () => stopAnimation();
      const startTime = performance.now();

      const step = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        window.scrollTo(0, start + distance * easeInOutCubic(progress));

        if (progress < 1) {
          frameId = requestAnimationFrame(step);
        } else {
          frameId = null;
          removeInterruptListeners?.();
          removeInterruptListeners = null;
        }
      };

      removeInterruptListeners = () => {
        window.removeEventListener('wheel', interrupt);
        window.removeEventListener('touchstart', interrupt);
        window.removeEventListener('keydown', onNavigationKey);
      };

      window.addEventListener('wheel', interrupt, { passive: true });
      window.addEventListener('touchstart', interrupt, { passive: true });
      window.addEventListener('keydown', onNavigationKey);

      frameId = requestAnimationFrame(step);
    };

    const onClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const clicked = event.target;
      if (!(clicked instanceof Element)) {
        return;
      }

      const anchor = clicked.closest('a[href^="#"]');
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }

      const hash = anchor.getAttribute('href');
      if (!hash || hash === '#') {
        return;
      }

      const id = hash.slice(1);
      const element = id ? document.getElementById(id) : null;
      if (!element) {
        return;
      }

      // Respect user motion preferences: let the browser handle it natively.
      if (prefersReducedMotion()) {
        return;
      }

      event.preventDefault();
      stopAnimation();
      history.pushState(null, '', `#${id}`);
      scrollToElement(element);
    };

    document.addEventListener('click', onClick, true);

    // Optional: apply the same smooth displacement when the page loads with a hash.
    if (window.location.hash.length > 1) {
      const id = window.location.hash.slice(1);
      const element = document.getElementById(id);
      if (element) {
        initialFrameId = requestAnimationFrame(() => {
          if (!disposed) {
            scrollToElement(element);
          }
        });
      }
    }

    return () => {
      disposed = true;
      if (initialFrameId !== null) {
        cancelAnimationFrame(initialFrameId);
      }
      document.removeEventListener('click', onClick, true);
      stopAnimation();
    };
  }, []);

  return null;
}
