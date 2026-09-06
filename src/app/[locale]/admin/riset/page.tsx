import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { buildMetadata } from '@/lib/seo/metadata';
import { isAdmin } from '@/lib/auth/is-admin';
import { getDisplayTimezone } from '@/lib/auth/timezone';
import { createSupabaseServer } from '@/lib/supabase/server';
import { ResearchListClient } from '@/components/admin/ResearchListClient';

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; platform?: string; date?: string; sort?: string; page?: string }>;
}

const PAGE_SIZE = 20;

const ALLOWED_STATUS = new Set(['pending', 'discovering', 'verifying', 'scoring', 'awaiting_selection', 'developing', 'completed', 'failed']);
const ALLOWED_DATE = new Set(['all', '7d', '30d']);
const ALLOWED_SORT = new Set(['newest', 'oldest']);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin.research' });
  return buildMetadata({
    locale: locale as Locale,
    path: '/admin/riset',
    title: t('title'),
    description: t('intro'),
    robots: { index: false, follow: false }
  });
}

function normalizeParams(p: Awaited<PageProps['searchParams']>) {
  const status = p.status && ALLOWED_STATUS.has(p.status) ? p.status : 'all';
  const platform = p.platform ?? 'all';
  const date = p.date && ALLOWED_DATE.has(p.date) ? p.date : 'all';
  const sort = p.sort && ALLOWED_SORT.has(p.sort) ? p.sort : 'newest';
  const page = Math.max(1, Number.parseInt(p.page ?? '1', 10) || 1);
  return { status, platform, date, sort, page };
}

function dateFromNow(period: string): string | null {
  if (period === 'all') return null;
  const days = period === '7d' ? 7 : 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export default async function ResearchListPage({ params, searchParams }: PageProps) {
  const rawLocale = (await params).locale;
  const locale = (routing.locales.includes(rawLocale as Locale) ? rawLocale : routing.defaultLocale) as Locale;
  setRequestLocale(locale);

  if (!(await isAdmin())) {
    redirect({ href: '/masuk', locale });
  }

  const supabase = await createSupabaseServer();
  const t = await getTranslations({ locale, namespace: 'admin.research' });
  const timeZone = await getDisplayTimezone();

  if (!supabase) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 text-sm text-ink-muted">
        Service unavailable
      </div>
    );
  }

  const sp = normalizeParams(await searchParams);
  const since = dateFromNow(sp.date);
  const ascending = sp.sort === 'oldest';
  const fromRow = (sp.page - 1) * PAGE_SIZE;
  const toRow = fromRow + PAGE_SIZE - 1;

  // platforms for filter
  const { data: platData } = await supabase.from('platforms').select('slug, display_name').eq('is_active', true).order('slug');
  const platformOptions = (platData ?? []) as { slug: string; display_name: string }[];
  const allowedPlatforms = new Set(platformOptions.map((p) => p.slug));
  const platform = sp.platform !== 'all' && allowedPlatforms.has(sp.platform) ? sp.platform : 'all';

  let query = supabase.from('content_research_sessions').select('id, status, topic, target_location, platform_slug, platform_slugs, created_at, error_message', { count: 'exact' }).order('created_at', { ascending }).range(fromRow, toRow);
  if (sp.status !== 'all') query = query.eq('status', sp.status);
  if (platform !== 'all') {
    if (platform === 'all_null') query = query.is('platform_slug', null);
    else query = query.or(`platform_slug.eq.${platform},platform_slugs.cs.{${platform}}`);
  }
  if (since) query = query.gte('created_at', since);

  const { data: sessions, error: sessionsError, count } = await query;
  const list = (sessions ?? []) as Array<{ id: string; status: string; topic: string | null; target_location: string | null; platform_slug: string | null; platform_slugs: string[] | null; created_at: string; error_message: string | null }>;
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">{t('title')}</h1>
        <p className="mt-2 text-sm text-ink-muted">{t('intro')}</p>
      </header>

      <ResearchListClient sessions={list} sessionsError={sessionsError?.message ?? null} platforms={platformOptions} filters={sp} page={sp.page} totalPages={totalPages} totalCount={totalCount} pageSize={PAGE_SIZE} locale={locale} timeZone={timeZone} />
    </div>
  );
}
