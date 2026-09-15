import { ChevronDown } from 'lucide-react';
import { SectionHeading } from './SectionHeading';
import type { LandingFaqContent } from './types';

interface LandingFaqProps {
  faq: LandingFaqContent;
}

export function LandingFaq({ faq }: Readonly<LandingFaqProps>) {
  return (
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-24">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <SectionHeading
          id="faq-title"
          eyebrow={faq.eyebrow}
          title={faq.title}
          subtitle={faq.subtitle}
        />

        <div className="mx-auto mt-12 max-w-3xl space-y-3">
          {faq.items.map((item) => (
            <details
              key={item.question}
              className="group rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm transition hover:border-blue-400/30 open:border-blue-400/30 open:bg-white/[0.07]"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-5 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 [&::-webkit-details-marker]:hidden">
                <h3 className="text-sm font-semibold text-white sm:text-base">{item.question}</h3>
                <ChevronDown
                  className="h-5 w-5 shrink-0 text-blue-300 transition-transform duration-300 group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <div className="px-5 pb-5">
                <p className="text-sm leading-relaxed text-slate-300">{item.answer}</p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
