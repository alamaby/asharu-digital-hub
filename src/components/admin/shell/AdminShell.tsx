'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useAdminSidebar } from './AdminSidebarContext';
import { AdminHeader } from './AdminHeader';
import { AdminThemeScript } from './AdminThemeScript';
import { cn } from '@/lib/utils/cn';

interface AdminShellProps {
  children: ReactNode;
  sidebar: ReactNode;
}

/**
 * Rangka shell admin (adaptasi TailAdmin `(admin)/layout`):
 * sidebar + backdrop + header + konten. Main landmark `#admin-content`
 * dengan skip-link sendiri (terpisah dari `#main-content` publik).
 */
export function AdminShell({ children, sidebar }: AdminShellProps) {
  const t = useTranslations('header');
  const { isExpanded, isHovered, isMobileOpen, closeMobileSidebar } = useAdminSidebar();

  const mainMargin = isMobileOpen ? 'ml-0' : isExpanded || isHovered ? 'lg:ml-[290px]' : 'lg:ml-[90px]';

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 xl:flex dark:bg-gray-900 dark:text-white/90">
      <AdminThemeScript />
      <a
        href="#admin-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[99999] focus:rounded-lg focus:bg-brand-500 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        {t('skipToContent')}
      </a>
      {sidebar}
      {isMobileOpen ? (
        <button
          type="button"
          aria-label={t('closeMenu')}
          onClick={closeMobileSidebar}
          className="fixed inset-0 z-40 bg-gray-900/50 lg:hidden"
        />
      ) : null}
      <div className={cn('flex-1 transition-all duration-300 ease-in-out', mainMargin)}>
        <AdminHeader />
        <main id="admin-content" tabIndex={-1} className="focus:outline-none">
          <div className="mx-auto max-w-7xl p-4 md:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
