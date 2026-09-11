import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { buildMetadata } from '@/lib/seo/metadata';
import { createSupabaseServer } from '@/lib/supabase/server';
import { getDisplayTimezone } from '@/lib/auth/timezone';
import { ReviewListClient } from '@/components/admin/ReviewListClient';
import { REVIEW_PROVIDERS, REVIEW_STATUSES, parseMultiParam } from '@/lib/admin/review-list';

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; provider?: string; platform?: string; date?: string; sort?: string; page?: string }>;
}

const PAGE_SIZE = 12;
const ALLOWED_DATE = new Set(['all', '7d', '30d']);
const ALLOWED_SORT = new Set(['newest', 'oldest']);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.konten.review' });
  return buildMetadata({
    locale: locale as Locale,
    path: '/konten/review',
    title: t('title'),
    description: t('description'),
    robots: { index: false, follow: false }
  });
}

function normalizeParams(p: Awaited<PageProps['searchParams']>) {
  const date = p.date && ALLOWED_DATE.has(p.date) ? p.date : 'all';
  const sort = p.sort && ALLOWED_SORT.has(p.sort) ? p.sort : 'newest';
  const page = Math.max(1, Number.parseInt(p.page ?? '1', 10) || 1);
  return { statusRaw: p.status, providerRaw: p.provider, platformRaw: p.platform, date, sort, page };
}

function dateFromNow(period: string): string | null {
  if (period === 'all') return null;
  const days = period === '7d' ? 7 : 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

const DRAFT_SELECT =
  'id, status, created_at, platform_slug, research_topic_id, generated_thread, affiliate_injections, llm_meta';

export default async function ReviewPage({ params, searchParams }: PageProps) {
  const rawLocale = (await params).locale;
  const locale = (routing.locales.includes(rawLocale as Locale) ? rawLocale : routing.defaultLocale) as Locale;
  setRequestLocale(locale);

  const supabaseServer = await createSupabaseServer();
  if (!supabaseServer) {
    redirect({ href: '/masuk', locale });
  }
  const supabase = supabaseServer!;

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    redirect({ href: '/masuk', locale });
  }

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user!.id).maybeSingle();
  const isAdmin = Boolean((profile as { is_admin?: boolean } | null)?.is_admin);
  if (!isAdmin) {
    redirect({ href: '/masuk', locale });
  }

  const t = await getTranslations({ locale, namespace: 'content.review' });
  const sp = normalizeParams(await searchParams);

  // Platform options dulu (allowlist untuk parse + filter).
  const { data: platOpts } = await supabase.from('platforms').select('slug, display_name').eq('is_active', true).order('slug');
  const platformOptions = (platOpts ?? []) as { slug: string; display_name: string }[];
  const allowedPlatforms = new Set(platformOptions.map((p) => p.slug));

  // Multi-select: `?status=a,b&provider=c,d&platform=e,f`. Kosong = semua.
  const selectedStatus = parseMultiParam(sp.statusRaw, REVIEW_STATUSES);
  const selectedProviders = parseMultiParam(sp.providerRaw, REVIEW_PROVIDERS);
  const selectedPlatforms = parseMultiParam(sp.platformRaw, allowedPlatforms);

  const since = dateFromNow(sp.date);
  const ascending = sp.sort === 'oldest';
  const fromRow = (sp.page - 1) * PAGE_SIZE;
  const toRow = fromRow + PAGE_SIZE - 1;

  // Fetch drafts dengan filter — provider via jsonb, platform via kolom draf.
  // Draf agnostik warisan (platform_slug 'all'/null) hanya muncul saat filter platform kosong.
  function baseQuery() {
    let q = supabase.from('content_drafts').select(DRAFT_SELECT, { count: 'exact' }).order('created_at', { ascending }).range(fromRow, toRow);
    if (selectedStatus.length > 0) q = q.in('status', selectedStatus);
    if (selectedProviders.length > 0) q = q.in('llm_meta->>provider' as never, selectedProviders as never);
    if (since) q = q.gte('created_at', since);
    if (selectedPlatforms.length > 0) q = q.in('platform_slug', selectedPlatforms);
    return q;
  }

  const first = await baseQuery();
  let drafts = (first.data ?? []) as unknown as DraftListCardImport[];
  let count = first.count;
  let draftsError = first.error;
  if (draftsError) {
    // Fallback: filter provider jsonb dilepas, filter lain dipertahankan.
    let q = supabase.from('content_drafts').select(DRAFT_SELECT, { count: 'exact' }).order('created_at', { ascending }).range(fromRow, toRow);
    if (selectedStatus.length > 0) q = q.in('status', selectedStatus);
    if (since) q = q.gte('created_at', since);
    if (selectedPlatforms.length > 0) q = q.in('platform_slug', selectedPlatforms);
    const retry = await q;
    drafts = (retry.data ?? []) as unknown as DraftListCardImport[];
    count = retry.count;
    if (retry.error) draftsError = retry.error;
  }

  const totalCount = count ?? drafts.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Map research_topic_id → session_id untuk link riset sumber per kartu (1 query).
  const visibleTopicIds = [...new Set(
    drafts
      .map((d) => (d as unknown as { research_topic_id?: string | null }).research_topic_id)
      .filter((v): v is string => Boolean(v))
  )];
  let topicSessionMap: Record<string, string> = {};
  if (visibleTopicIds.length > 0) {
    const { data: topicRows } = await supabase
      .from('content_research_topics')
      .select('id, session_id')
      .in('id', visibleTopicIds);
    topicSessionMap = Object.fromEntries(
      ((topicRows ?? []) as { id: string; session_id: string }[]).map((r) => [r.id, r.session_id])
    );
  }

  const timeZone = await getDisplayTimezone();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">{t('title')}</h1>
        <p className="mt-2 text-sm text-ink-muted">{t('realtime')}</p>

        <ReviewListClient
          drafts={drafts as never}
          topicSessionMap={topicSessionMap}
          platforms={platformOptions}
          filters={{ status: selectedStatus, provider: selectedProviders, platform: selectedPlatforms, date: sp.date, sort: sp.sort }}
          page={sp.page}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={PAGE_SIZE}
          locale={locale}
          timeZone={timeZone}
          error={draftsError?.message ?? null}
        />
    </div>
  );
}

interface DraftListCardImport {
  id: string;
  status: string;
  created_at: string;
  platform_slug?: string | null;
  research_topic_id?: string | null;
  generated_thread: { main: { id: string; en: string }; replies: { id: string; en: string }[] };
  affiliate_injections: { friendly_code: string; product_name_id?: string; product_image?: string; match_score?: number }[];
  llm_meta?: { provider: string; model: string; platform?: string };
}
