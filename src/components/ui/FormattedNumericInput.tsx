'use client';

interface FormattedNumericInputProps {
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
  maxValue?: number;
  id?: string;
  className?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-describedby'?: string;
  'aria-label'?: string;
}

export function FormattedNumericInput({
  value,
  onChange,
  suffix,
  maxValue = 9_999_999_999_999,
  id,
  className,
  ...ariaProps
}: Readonly<FormattedNumericInputProps>) {
  function format(v: number): string {
    const formatted = (v / 100).toLocaleString('es-CO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return suffix ? `${formatted} ${suffix}` : formatted;
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key >= '0' && e.key <= '9') {
      e.preventDefault();
      const next = value * 10 + parseInt(e.key);
      if (next > maxValue) return;
      onChange(next);
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      onChange(Math.floor(value / 10));
    }
  }

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      value={format(value)}
      onKeyDown={handleKeyDown}
      onChange={() => {}}
      className={className}
      {...ariaProps}
    />
  );
}
