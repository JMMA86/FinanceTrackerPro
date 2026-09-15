import { SectionHeading } from './SectionHeading';
import type { LandingStepsContent } from './types';

interface LandingStepsProps {
  steps: LandingStepsContent;
}

export function LandingSteps({ steps }: Readonly<LandingStepsProps>) {
  return (
    <section id="how-it-works" aria-labelledby="steps-title" className="scroll-mt-24">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <SectionHeading
          id="steps-title"
          eyebrow={steps.eyebrow}
          title={steps.title}
          subtitle={steps.subtitle}
        />

        <ol className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
          {steps.items.map((item, index) => (
            <li
              key={item.title}
              className="relative h-full rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm"
            >
              <span
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-blue-400/30 bg-blue-500/10 text-lg font-bold text-blue-200"
                aria-hidden="true"
              >
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-5 text-base font-semibold text-white">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">{item.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
