import type { ReactNode } from 'react';

interface SectionHeadingProps {
  id: string;
  title: string;
  description?: string;
  children?: ReactNode;
}

/** Section heading block; `id` matches the section's `aria-labelledby`. */
export function SectionHeading({ id, title, description, children }: SectionHeadingProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="max-w-2xl">
        <h2 id={id} className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          {title}
        </h2>
        {description ? <p className="mt-2 text-base text-ink-muted">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}
