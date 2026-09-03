'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import type { NavItem } from '@/config/navigation';
import { cn } from '@/lib/utils/cn';
import { adminNavItems } from '@/config/navigation';

export function AdminTopBar() {
  const t = useTranslations('nav');
  const pathname = usePathname();

  const renderItem = (item: NavItem) => {
    const active = pathname === item.pathname || pathname.startsWith(item.pathname + '/');
    return (
      <Link
        key={item.key}
        href={{ pathname: item.pathname as never }}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
          active ? 'bg-primary text-white' : 'text-ink-muted hover:bg-surface hover:text-primary'
        )}
      >
        {t(item.key)}
      </Link>
    );
  };

  return (
    <nav aria-label="Admin navigation" className="border-b border-line bg-muted/50">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex items-center gap-1 overflow-x-auto py-2 scrollbar-none">
          <span className="mr-2 hidden text-xs font-semibold uppercase tracking-wide text-ink-muted sm:inline">{t('adminLabel')}</span>
          {adminNavItems.map(renderItem)}
        </div>
      </div>
    </nav>
  );
}
