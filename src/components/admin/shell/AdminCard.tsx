import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

interface AdminCardProps {
  title: string;
  desc?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Kartu standar area non-publik (adaptasi TailAdmin ComponentCard).
 * Memakai token surface/line/ink sehingga otomatis ikut mode gelap.
 */
export function AdminCard({ title, desc, action, children, className }: AdminCardProps) {
  return (
    <section
      aria-label={title}
      className={cn(
        'rounded-2xl border border-line bg-surface shadow-card dark:shadow-none',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3 px-6 py-5">
        <div>
          <h3 className="text-base font-medium text-ink">{title}</h3>
          {desc ? <p className="mt-1 text-sm text-ink-muted">{desc}</p> : null}
        </div>
        {action}
      </div>
      <div className="border-t border-line p-4 sm:p-6">{children}</div>
    </section>
  );
}
