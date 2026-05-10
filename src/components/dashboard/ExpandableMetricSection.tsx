'use client';

import { useState, ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface ExpandableMetricSectionProps {
  readonly title: string;
  readonly icon: ReactNode;
  readonly children: ReactNode;
  readonly defaultOpen?: boolean;
  readonly category: string;
}

export function ExpandableMetricSection({
  title,
  icon,
  children,
  defaultOpen = false,
  category,
}: ExpandableMetricSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const categoryAccent: Record<string, string> = {
    liquidity: 'text-emerald-400',
    debts: 'text-rose-400',
    investments: 'text-violet-400',
    expenses: 'text-amber-400',
  };

  const accent = categoryAccent[category] ?? 'text-blue-400';

  return (
    <section className="animate-in fade-in slide-in-from-top-4 duration-500 rounded-xl sm:rounded-2xl border border-white/8 bg-slate-900/40 overflow-hidden">
      {/* Header — parte del mismo panel */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 sm:px-5 py-3 sm:py-3.5 hover:bg-white/4 transition-colors duration-200 group"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2 sm:gap-3">
          <div className={`p-1.5 sm:p-2 rounded-md bg-white/6 ${accent} [&>svg]:w-3.5 [&>svg]:h-3.5 sm:[&>svg]:w-4 sm:[&>svg]:h-4`}>
            {icon}
          </div>
          <h3 className="text-sm sm:text-base font-semibold text-white tracking-tight">{title}</h3>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-all duration-300 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Contenido expandible */}
      <div
        className={`overflow-hidden transition-all duration-300 ease-out ${
          isOpen ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="border-t border-white/6">
          {children}
        </div>
      </div>
    </section>
  );
}
