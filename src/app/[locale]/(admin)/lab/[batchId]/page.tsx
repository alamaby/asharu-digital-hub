import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { buildMetadata } from '@/lib/seo/metadata';
import { createSupabaseServer } from '@/lib/supabase/server';
import { getDisplayTimezone } from '@/lib/auth/timezone';
import { getLabBatch } from '@/lib/lab/actions';
import { summarizeLabRuns } from '@/lib/lab/stats';
import type { LabBatchWithRuns } from '@/lib/lab/types';
import { LabCompareGrid } from '@/components/lab/LabCompareGrid';
import { LabStats } from '@/components/lab/LabStats';
import { LabCardActions } from '@/components/lab/LabCardActions';
import { formatDateTime } from '@/lib/utils/format';

interface PageProps {
  params: Promise<{ locale: string; batchId: string }>;
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

export default async function LabDetailPage({ params }: PageProps) {
  const { locale: rawLocale, batchId } = await params;
  const locale = (routing.locales.includes(rawLocale as Locale)
    ? rawLocale
    : routing.defaultLocale) as Locale;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'lab.detail' });

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

  const timeZone = await getDisplayTimezone();
  let data: LabBatchWithRuns | null = null;
  try {
    data = await getLabBatch(batchId);
  } catch {
    data = null;
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <Link
          href={{ pathname: '/lab' }}
          locale={locale as 'id' | 'en'}
          className="text-sm text-primary hover:underline"
        >
          ← {t('back')}
        </Link>
        <p role="alert" className="mt-4 text-sm text-red-600">
          {t('notFound')}
        </p>
      </div>
    );
  }

  const stats = summarizeLabRuns(1, data.runs);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Link
        href={{ pathname: '/lab' }}
        locale={locale as 'id' | 'en'}
        className="text-sm text-primary hover:underline"
      >
        ← {t('back')}
      </Link>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink">{t('heading')}</h1>
      <p className="mt-1 text-sm text-ink-muted">
        {formatDateTime(data.batch.created_at, locale, timeZone)} · ID {data.batch.id.slice(0, 8)}
      </p>

      <div className="mt-4 space-y-2 rounded-xl border border-line bg-surface p-4">
        <p className="text-sm text-ink">
          <span className="font-medium">{t('promptLabel')}: </span>
          {data.batch.user_prompt}
        </p>
        {data.batch.system_prompt ? (
          <p className="text-sm text-ink-muted">
            <span className="font-medium">{t('systemLabel')}: </span>
            {data.batch.system_prompt}
          </p>
        ) : null}
      </div>

      <div className="mt-4">
        <LabCardActions batchId={data.batch.id} />
      </div>

      <LabCompareGrid result={data} />
      <LabStats initial={stats} locale={locale} />
    </div>
  );
}
