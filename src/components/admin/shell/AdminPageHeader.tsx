import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

interface AdminPageHeaderProps {
  title: string;
  intro?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/** Kepala halaman admin seragam: judul + intro + badge peran + aksi. */
export function AdminPageHeader({ title, intro, badge, actions, className }: AdminPageHeaderProps) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{title}</h1>
        {intro ? <p className="mt-1 text-sm text-ink-muted">{intro}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {badge}
        {actions}
      </div>
    </header>
  );
}
