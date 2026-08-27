'use client';

import { get } from '@/lib/i18n';

export const PRESETS = [
  { key: 'blue', from: '#1d4ed8', to: '#1e3a8a' },
  { key: 'violet', from: '#7c3aed', to: '#4c1d95' },
  { key: 'emerald', from: '#059669', to: '#065f46' },
  { key: 'amber', from: '#d97706', to: '#92400e' },
  { key: 'rose', from: '#e11d48', to: '#881337' },
  { key: 'slate', from: '#475569', to: '#1e293b' },
  { key: 'gold', from: '#ca8a04', to: '#78350f' },
  { key: 'black', from: '#374151', to: '#111827' },
  { key: 'white', from: '#f8fafc', to: '#e2e8f0' },
] as const;

export type PresetKey = (typeof PRESETS)[number]['key'];

export const LIGHT_PRESET_KEYS = new Set<string>(['white']);

export function getPresetGradient(key: string): string | undefined {
  const preset = PRESETS.find((p) => p.key === key);
  return preset ? `linear-gradient(135deg, ${preset.from}, ${preset.to})` : undefined;
}

interface CardDesignPickerProps {
  cardColor: string | null;
  onColorChange: (key: string | null) => void;
  dictionary: Record<string, unknown>;
}

export function CardDesignPicker({
  cardColor,
  onColorChange,
  dictionary,
}: Readonly<CardDesignPickerProps>) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
        {get(dictionary, 'cardDesign')}
      </p>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => {
          const isSelected = cardColor === preset.key;
          return (
            <button
              key={preset.key}
              type="button"
              onClick={() => onColorChange(isSelected ? null : preset.key)}
              aria-label={preset.key}
              aria-pressed={isSelected}
              className={`w-8 h-8 rounded-lg transition-all duration-150 ${
                isSelected
                  ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900 scale-110'
                  : 'opacity-80 hover:opacity-100 hover:scale-105'
              }`}
              style={{ background: `linear-gradient(135deg, ${preset.from}, ${preset.to})` }}
            />
          );
        })}
      </div>
    </div>
  );
}
