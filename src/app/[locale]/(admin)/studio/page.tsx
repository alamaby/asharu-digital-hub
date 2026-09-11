import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { buildMetadata } from '@/lib/seo/metadata';
import { createSupabaseServer } from '@/lib/supabase/server';
import { listStudioOptions, listUserImages, getStudioQuota } from '@/lib/studio/actions';
import { StudioPageClient } from '@/components/studio/StudioPageClient';
import type { StudioOptions, StudioQuota, StudioGenerationRow } from '@/lib/studio/types';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.studio' });
  return buildMetadata({
    locale: locale as Locale,
    path: '/studio',
    title: t('title'),
    description: t('description'),
    robots: { index: false, follow: false }
  });
}

export default async function StudioPage({ params }: PageProps) {
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

  let options: StudioOptions | null = null;
  let quota: StudioQuota | null = null;
  let images: StudioGenerationRow[] = [];
  let err: string | null = null;
  try {
    [options, quota, images] = await Promise.all([
      listStudioOptions(),
      getStudioQuota(),
      listUserImages({ limit: 30 })
    ]);
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }

  return (
    <StudioPageClient
      locale={locale}
      options={options}
      quota={quota}
      images={images}
      error={err}
    />
  );
}
