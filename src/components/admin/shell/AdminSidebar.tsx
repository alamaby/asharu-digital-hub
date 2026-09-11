'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils/cn';
import { useAdminSidebar } from './AdminSidebarContext';
import { adminNavGroups, adminSignInEntry, isNavActive } from './admin-nav';
import type { AdminNavGroup } from './admin-nav';

const GROUP_LABEL_KEYS: Record<AdminNavGroup['id'], string> = {
  manage: 'groupManage',
  create: 'groupCreate',
  other: 'groupOther'
};

interface AdminSidebarProps {
  isAdmin: boolean;
}

/**
 * Sidebar classic-collapsible (adaptasi TailAdmin AppSidebar):
 * ikon+label saat expanded/hover/mobile, ikon saja saat collapsed,
 * drawer + backdrop di mobile. Ikon lucide-react, label next-intl.
 */
export function AdminSidebar({ isAdmin }: AdminSidebarProps) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const { isExpanded, isMobileOpen, isHovered, setIsHovered, closeMobileSidebar } =
    useAdminSidebar();

  const showLabel = isExpanded || isHovered || isMobileOpen;

  const renderEntry = (entry: (typeof adminNavGroups)[number]['entries'][number]) => {
    const active = isNavActive(pathname, entry);
    const Icon = entry.icon;
    return (
      <li key={entry.key}>
        <Link
          href={{ pathname: entry.pathname as never }}
          aria-current={active ? 'page' : undefined}
          onClick={closeMobileSidebar}
          className={cn(
            'menu-item group',
            active ? 'menu-item-active' : 'menu-item-inactive',
            !showLabel && 'lg:justify-center'
          )}
        >
          <span className={active ? 'menu-item-icon-active' : 'menu-item-icon-inactive'}>
            <Icon className="size-5 shrink-0" aria-hidden />
          </span>
          {showLabel ? <span className="truncate">{t(entry.key ?? 'home')}</span> : null}
        </Link>
      </li>
    );
  };

  return (
    <aside
      aria-label={t('adminLabel')}
      className={cn(
        'fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-gray-200 bg-white px-5 transition-all duration-300 ease-in-out dark:border-gray-800 dark:bg-gray-900',
        isExpanded || isMobileOpen ? 'w-[290px]' : isHovered ? 'w-[290px]' : 'w-[90px]',
        isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      )}
      onMouseEnter={() => {
        if (!isExpanded) setIsHovered(true);
      }}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={cn('flex py-8', !showLabel ? 'lg:justify-center' : 'justify-start')}>
        <Link
          href="/"
          onClick={closeMobileSidebar}
          className="rounded-md text-xl font-bold tracking-tight text-brand-500 dark:text-brand-400"
          aria-label="Asharu — asharu.id"
        >
          {showLabel ? (
            <>
              Asharu<span className="text-orange-400" aria-hidden>.</span>
            </>
          ) : (
            <span aria-hidden>A.</span>
          )}
        </Link>
      </div>
      <nav className="no-scrollbar flex flex-col gap-6 overflow-y-auto pb-6">
        {adminNavGroups.map((group) => {
          const entries = group.entries.filter((entry) => isAdmin || !entry.adminOnly);
          if (entries.length === 0) return null;
          return (
            <div key={group.id}>
              <h2
                className={cn(
                  'mb-4 flex text-xs uppercase leading-5 text-gray-400',
                  !showLabel ? 'lg:justify-center' : 'justify-start'
                )}
              >
                {showLabel ? t(GROUP_LABEL_KEYS[group.id]) : <span aria-hidden>···</span>}
              </h2>
              <ul className="flex flex-col gap-1">
                {entries.map(renderEntry)}
              </ul>
            </div>
          );
        })}
        {!isAdmin ? (
          <div>
            <ul className="flex flex-col gap-1">{renderEntry(adminSignInEntry)}</ul>
          </div>
        ) : null}
      </nav>
    </aside>
  );
}
