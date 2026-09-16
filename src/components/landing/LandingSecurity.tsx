import { ShieldCheck } from 'lucide-react';
import { SectionHeading } from './SectionHeading';
import { resolveIcon } from './icons';
import type { LandingSecurityContent } from './types';

interface LandingSecurityProps {
  security: LandingSecurityContent;
}

export function LandingSecurity({ security }: Readonly<LandingSecurityProps>) {
  return (
    <section
      id="security"
      aria-labelledby="security-title"
      className="scroll-mt-24 border-y border-white/10 bg-slate-950/30"
    >
      <div className="mx-auto grid max-w-7xl items-start gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8 lg:py-24">
        <div>
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-500/10 text-emerald-300">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="mt-6">
            <SectionHeading
              id="security-title"
              eyebrow={security.eyebrow}
              title={security.title}
              subtitle={security.description}
              align="left"
            />
          </div>
          <p className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-relaxed text-slate-300">
            {security.note}
          </p>
        </div>

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {security.controls.map((control) => {
            const Icon = resolveIcon(control.icon);

            return (
              <li
                key={control.title}
                className="h-full rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10 text-blue-300">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-sm font-semibold text-white">{control.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">{control.description}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
