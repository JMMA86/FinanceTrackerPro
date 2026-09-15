/**
 * Reusable heading block for landing sections.
 * Renders an optional eyebrow, an h2 (linked via `aria-labelledby`) and subtitle.
 */

interface SectionHeadingProps {
  id: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: 'left' | 'center';
}

export function SectionHeading({
  id,
  eyebrow,
  title,
  subtitle,
  align = 'center',
}: Readonly<SectionHeadingProps>) {
  const alignment = align === 'center' ? 'mx-auto text-center' : 'text-left';

  return (
    <div className={`max-w-3xl ${alignment}`}>
      {eyebrow ? (
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">{eyebrow}</p>
      ) : null}
      <h2
        id={id}
        className="mt-3 text-2xl font-bold leading-tight text-white sm:text-3xl lg:text-4xl"
      >
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-4 text-sm leading-relaxed text-slate-300 sm:text-base">{subtitle}</p>
      ) : null}
    </div>
  );
}
