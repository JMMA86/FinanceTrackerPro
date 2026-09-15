'use client';

/**
 * Mobile navigation disclosure for the landing header.
 *
 * Uses the native `<details>` element (no open/close state in React) and only
 * clears the `open` attribute when a link is activated, so the menu does not
 * stay covering the page after navigating to an anchor.
 */

import { useRef } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import type { Locale } from '@/lib/i18n';
import type { LandingNav } from './types';

interface LandingMobileNavProps {
  lang: Locale;
  nav: LandingNav;
}

const ANCHORS = ['features', 'benefits', 'security', 'faq'] as const;

export function LandingMobileNav({ lang, nav }: Readonly<LandingMobileNavProps>) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  const closeMenu = () => {
    if (detailsRef.current) {
      detailsRef.current.open = false;
    }
  };

  return (
    <details ref={detailsRef} className="group relative lg:hidden">
      <summary className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 [&::-webkit-details-marker]:hidden">
        <Menu className="h-5 w-5 group-open:hidden" aria-hidden="true" />
        <X className="hidden h-5 w-5 group-open:block" aria-hidden="true" />
        <span className="sr-only group-open:hidden">{nav.openMenu}</span>
        <span className="sr-only hidden group-open:inline">{nav.closeMenu}</span>
      </summary>

      <div className="absolute right-0 top-full z-50 mt-2 w-60 rounded-2xl border border-white/10 bg-slate-900/95 p-2 shadow-2xl backdrop-blur-xl animate-slideUp">
        <nav aria-label={nav.mainNavLabel}>
          <ul className="flex flex-col">
            {ANCHORS.map((anchor) => (
              <li key={anchor}>
                <Link
                  href={`#${anchor}`}
                  onClick={closeMenu}
                  className="block rounded-xl px-4 py-3 text-sm font-medium text-slate-200 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  {nav[anchor]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-1 border-t border-white/10 pt-1">
          <Link
            href={`/${lang}/login`}
            onClick={closeMenu}
            className="block rounded-xl px-4 py-3 text-sm font-semibold text-blue-200 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            {nav.login}
          </Link>
        </div>
      </div>
    </details>
  );
}
