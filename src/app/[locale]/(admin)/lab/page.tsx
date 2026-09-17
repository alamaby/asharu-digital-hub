import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { buildMetadata } from '@/lib/seo/metadata';
import { createSupabaseServer } from '@/lib/supabase/server';
import { getDisplayTimezone } from '@/lib/auth/timezone';
import { getLabQuota, getLabStats, listLabBatches, listLabOptions } from '@/lib/lab/actions';
import { LabPageClient } from '@/components/lab/LabPageClient';
import type { LabBatchPage, LabOptions, LabQuota } from '@/lib/lab/types';
import type { LabSummary } from '@/lib/lab/stats';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.lab' });
  return buildMetadata({
    locale: locale as Locale,
    path: '/lab',
    title: t('title'),
    description: t('description'),
    robots: { index: false, follow: false }
  });
}

export default async function LabPage({ params }: PageProps) {
  const rawLocale = (await params).locale;
  const locale = (routing.locales.includes(rawLocale as Locale)
    ? rawLocale
    : routing.defaultLocale) as Locale;
  setRequestLocale(locale);

  const supabaseServer = await createSupabaseServer();
  if (!supabaseServer) {
    redirect({ href: '/masuk', locale });
  }
  // `redirect` throws NavigationError; for typecheck, treat supabaseServer as defined.
  const supabase = supabaseServer as NonNullable<typeof supabaseServer>;
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    redirect({ href: '/masuk', locale });
  }

  let options: LabOptions | null = null;
  let quota: LabQuota | null = null;
  let initialPage: LabBatchPage = { items: [], total: 0, page: 1, pageSize: 10, totalPages: 1 };
  let stats: LabSummary | null = null;
  let err: string | null = null;
  // Zona waktu display user untuk timestamp riwayat (pola admin/llm/logs).
  const timeZone = await getDisplayTimezone();
  try {
    [options, quota, initialPage, stats] = await Promise.all([
      listLabOptions(),
      getLabQuota(),
      listLabBatches({ page: 1, pageSize: 10 }),
      getLabStats('30d')
    ]);
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }

  return (
    <LabPageClient
      locale={locale}
      timeZone={timeZone}
      options={options}
      quota={quota}
      initialPage={initialPage}
      stats={stats}
      error={err}
    />
  );
}
