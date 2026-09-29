import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { buildMetadata } from '@/lib/seo/metadata';
import { createSupabaseServer } from '@/lib/supabase/server';
import { listStudioBatches, listStudioOptions, getStudioQuota } from '@/lib/studio/actions';
import { BatchPageClient } from '@/components/studio/BatchPageClient';
import type { StudioBatchWithCounts } from '@/lib/studio/types';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.studioBatch' });
  return buildMetadata({
    locale: locale as Locale,
    path: '/studio/batch',
    title: t('title'),
    description: t('description'),
    robots: { index: false, follow: false }
  });
}

export default async function BatchPage({ params }: PageProps) {
  const rawLocale = (await params).locale;
  const locale = (routing.locales.includes(rawLocale as Locale)
    ? rawLocale
    : routing.defaultLocale) as Locale;
  setRequestLocale(locale);

  const supabaseServer = await createSupabaseServer();
  if (!supabaseServer) {
    redirect({ href: '/masuk', locale });
  }
  const supabase = supabaseServer as NonNullable<typeof supabaseServer>;
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    redirect({ href: '/masuk', locale });
  }

  let options: Awaited<ReturnType<typeof listStudioOptions>> | null = null;
  let quota: Awaited<ReturnType<typeof getStudioQuota>> | null = null;
  let batches: StudioBatchWithCounts[] = [];
  let err: string | null = null;

  try {
    [options, quota, batches] = await Promise.all([
      listStudioOptions(),
      getStudioQuota(),
      listStudioBatches()
    ]);
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }

  return (
    <BatchPageClient
      locale={locale}
      options={options}
      quota={quota}
      batches={batches ?? []}
      error={err}
    />
  );
}
