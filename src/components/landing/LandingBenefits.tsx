import { Check } from 'lucide-react';
import { SectionHeading } from './SectionHeading';
import { resolveIcon } from './icons';
import type { LandingBenefitsContent } from './types';

interface LandingBenefitsProps {
  benefits: LandingBenefitsContent;
}

export function LandingBenefits({ benefits }: Readonly<LandingBenefitsProps>) {
  return (
    <section
      id="benefits"
      aria-labelledby="benefits-title"
      className="scroll-mt-24 border-y border-white/10 bg-slate-950/30"
    >
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <SectionHeading
          id="benefits-title"
          eyebrow={benefits.eyebrow}
          title={benefits.title}
          subtitle={benefits.subtitle}
        />

        <ul className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-2">
          {benefits.items.map((item) => {
            const Icon = resolveIcon(item.icon);

            return (
              <li
                key={item.title}
                className="flex h-full gap-4 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm transition duration-300 hover:border-blue-400/30 hover:bg-white/[0.07]"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-500/10 text-emerald-300">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="flex items-center gap-2 text-base font-semibold text-white">
                    <Check className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">{item.description}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
