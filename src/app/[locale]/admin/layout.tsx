import type { ReactNode } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { isAdmin } from '@/lib/auth/is-admin';
import { AdminTopBar } from '@/components/admin/AdminTopBar';

interface Props {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function AdminLayout({ children, params }: Props) {
  const { locale: rawLocale } = await params;
  const locale = (routing.locales.includes(rawLocale as Locale) ? rawLocale : routing.defaultLocale) as Locale;
  setRequestLocale(locale);

  if (!(await isAdmin())) {
    redirect({ href: '/masuk', locale });
  }

  return (
    <div>
      <AdminTopBar />
      {children}
    </div>
  );
}
