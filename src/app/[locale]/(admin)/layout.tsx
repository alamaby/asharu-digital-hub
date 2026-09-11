import type { ReactNode } from 'react';
import { setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { AdminThemeProvider } from '@/components/admin/shell/AdminThemeContext';
import { AdminSidebarProvider } from '@/components/admin/shell/AdminSidebarContext';
import { AdminShell } from '@/components/admin/shell/AdminShell';
import { AdminSidebarSlot } from '@/components/admin/shell/AdminSidebarSlot';

interface Props {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

/**
 * Layout grup non-publik: provider tema + sidebar dan shell TailAdmin.
 * Tanpa guard di sini — guard milik tiap area (`admin/layout` untuk guard
 * admin; halaman `/konten/baru` dan `/masuk` tetap publik). Slot sidebar
 * membaca `profiles.is_admin` (server) sehingga item admin tidak flicker;
 * akibatnya rute grup ini dinamis menurut kebutuhan — trade-off yang
 * disengaja, halaman publik di grup `(public)` tetap SSG penuh.
 */
export default async function NonPublicLayout({ children, params }: Props) {
  const { locale: rawLocale } = await params;
  const locale = (routing.locales.includes(rawLocale as Locale) ? rawLocale : routing.defaultLocale) as Locale;
  setRequestLocale(locale);

  return (
    <AdminThemeProvider>
      <AdminSidebarProvider>
        <AdminShell sidebar={<AdminSidebarSlot />}>{children}</AdminShell>
      </AdminSidebarProvider>
    </AdminThemeProvider>
  );
}
