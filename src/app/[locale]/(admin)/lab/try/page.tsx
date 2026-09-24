import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { buildMetadata } from '@/lib/seo/metadata';
import { createSupabaseServer } from '@/lib/supabase/server';
import { getDisplayTimezone } from '@/lib/auth/timezone';
import { getEndpointTryQuota, listEndpointTryRuns } from '@/lib/endpoint-try/actions';
import { EndpointTryPageClient } from '@/components/lab/EndpointTryClient';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  return buildMetadata({
    locale: locale as Locale,
    path: '/lab',
    title: t('lab.title'),
    description: t('lab.description'),
    robots: { index: false, follow: false }
  });
}

export default async function EndpointTryPage({ params }: PageProps) {
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

  let quota: { used: number; limit: number | null; remaining: number | null } | null = null;
  let history: Awaited<ReturnType<typeof listEndpointTryRuns>> | null = null;
  let err: string | null = null;
  const timeZone = await getDisplayTimezone();

  const [quotaRes, historyRes] = await Promise.allSettled([
    getEndpointTryQuota(),
    listEndpointTryRuns({ page: 1, pageSize: 10 })
  ]);
  if (quotaRes.status === 'fulfilled') {
    quota = quotaRes.value;
  } else {
    err = quotaRes.reason instanceof Error ? quotaRes.reason.message : String(quotaRes.reason);
  }
  if (historyRes.status === 'fulfilled') {
    history = historyRes.value;
  } else {
    const msg = historyRes.reason instanceof Error ? historyRes.reason.message : String(historyRes.reason);
    err = err ? `${err} · ${msg}` : msg;
  }

  return (
    <EndpointTryPageClient
      locale={locale}
      timeZone={timeZone}
      quota={quota}
      history={history}
      error={err}
    />
  );
}
