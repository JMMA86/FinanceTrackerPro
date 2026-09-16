import { SectionHeading } from './SectionHeading';
import { resolveIcon } from './icons';
import type { LandingFeaturesContent } from './types';

interface LandingFeaturesProps {
  features: LandingFeaturesContent;
}

export function LandingFeatures({ features }: Readonly<LandingFeaturesProps>) {
  return (
    <section id="features" aria-labelledby="features-title" className="scroll-mt-24">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <SectionHeading
          id="features-title"
          eyebrow={features.eyebrow}
          title={features.title}
          subtitle={features.subtitle}
        />

        <ul className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.items.map((item) => {
            const Icon = resolveIcon(item.icon);

            return (
              <li
                key={item.title}
                className="group h-full rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm transition duration-300 hover:-translate-y-1 hover:border-blue-400/30 hover:bg-white/[0.07] hover:shadow-2xl"
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10 text-blue-300">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-base font-semibold text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">{item.description}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
