'use client';

import { Moon, PanelLeft, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { useAdminSidebar } from './AdminSidebarContext';
import { useAdminTheme } from './AdminThemeContext';
import { adminNavGroups, adminSignInEntry } from './admin-nav';

/** Header admin (adaptasi TailAdmin AppHeader): toggle sidebar, breadcrumb, tema, bahasa. */
export function AdminHeader() {
  const tNav = useTranslations('nav');
  const tA11y = useTranslations('a11y');
  const pathname = usePathname();
  const { toggleSidebar, toggleMobileSidebar } = useAdminSidebar();
  const { theme, toggleTheme } = useAdminTheme();

  const handleToggle = () => {
    if (window.innerWidth >= 1024) {
      toggleSidebar();
    } else {
      toggleMobileSidebar();
    }
  };

  const active = adminNavGroups
    .flatMap((group) =>
      group.entries.map((entry) => ({ group: group.id, entry }))
    )
    .concat([{ group: 'other', entry: adminSignInEntry } as const])
    .filter(({ entry }) => pathname === entry.pathname || pathname.startsWith(entry.pathname + '/'))
    .sort((a, b) => b.entry.pathname.length - a.entry.pathname.length)[0];

  return (
    <header className="sticky top-0 z-40 flex w-full border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="flex grow items-center justify-between gap-2 px-3 py-3 lg:px-6 lg:py-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={handleToggle}
            aria-label={tNav('toggleSidebar')}
            className="flex size-10 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:bg-gray-100 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-white/5 lg:size-11"
          >
            <PanelLeft className="size-5" aria-hidden />
          </button>
          <nav aria-label={tA11y('breadcrumb')} className="hidden min-w-0 sm:block">
            <ol className="flex min-w-0 items-center gap-1.5 text-sm">
              <li className="shrink-0 text-gray-400 dark:text-gray-500">{tNav('adminLabel')}</li>
              {active ? (
                <>
                  <li aria-hidden className="shrink-0 text-gray-300 dark:text-gray-600">/</li>
                  <li className="truncate font-medium text-gray-800 dark:text-white/90">
                    {tNav(active.entry.key)}
                  </li>
                </>
              ) : null}
            </ol>
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={tNav('toggleTheme')}
            aria-pressed={theme === 'dark'}
            className="flex size-10 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:bg-gray-100 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-white/5"
          >
            {theme === 'dark' ? (
              <Sun className="size-5" aria-hidden />
            ) : (
              <Moon className="size-5" aria-hidden />
            )}
          </button>
          <LanguageSwitcher />
          <Link
            href="/"
            className="hidden rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 md:inline-flex dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/5"
          >
            {tNav('backToSite')}
          </Link>
        </div>
      </div>
    </header>
  );
}
