'use client';

import { navigationItems } from '@/config/navigation';
import { t } from './i18n-helpers';

interface StepExploreModulesProps {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  titleId: string;
  dictionary: Record<string, unknown>;
  /** `common` dictionary — module labels live under `navigation.*`. */
  common: Record<string, unknown>;
}

/** Step 3 — read-only tour of the dashboard modules. */
export function StepExploreModules({
  headingRef,
  titleId,
  dictionary,
  common,
}: Readonly<StepExploreModulesProps>) {
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h2
          ref={headingRef}
          id={titleId}
          tabIndex={-1}
          className="text-2xl font-bold text-white focus:outline-none sm:text-3xl"
        >
          {t(dictionary, 'steps.modules.title')}
        </h2>
        <p className="text-sm leading-relaxed text-slate-300">
          {t(dictionary, 'steps.modules.subtitle')}
        </p>
      </div>

      <ul className="animate-stagger grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          return (
            <li
              key={item.href}
              className="hover-lift group flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur hover:border-blue-400/40"
            >
              <span
                aria-hidden="true"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-300 transition-[transform,background-color,box-shadow] duration-200 group-hover:scale-110 group-hover:bg-blue-500/25 group-hover:shadow-[0_0_24px_-4px_rgba(59,130,246,0.85)]"
              >
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0 space-y-1">
                <h3 className="text-sm font-semibold text-white">
                  {t(common, `navigation.${item.nameKey}`)}
                </h3>
                <p className="text-xs leading-relaxed text-slate-400">
                  {t(common, `navigation.${item.descKey}`)}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-slate-500">{t(dictionary, 'steps.modules.hint')}</p>
    </section>
  );
}
