import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { buildMetadata } from '@/lib/seo/metadata';
import { createSupabaseService, createSupabaseServer } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/auth/is-admin';
import { KontenList } from '@/components/admin/KontenList';

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    status?: string;
    type?: string;
    platform?: string;
    date?: string;
    sort?: string;
    page?: string;
  }>;
}

const PAGE_SIZE = 20;

const ALLOWED_STATUS = new Set([
  'pending',
  'processing',
  'needs_review',
  'approved',
  'rejected',
  'failed'
]);
const ALLOWED_PLATFORMS_CACHE = new Set<string>();
const ALLOWED_TYPES = new Set(['requests', 'drafts', 'both']);
const ALLOWED_DATE = new Set(['all', '7d', '30d']);
const ALLOWED_SORT = new Set(['newest', 'oldest']);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin.konten' });
  return buildMetadata({
    locale: locale as Locale,
    path: '/admin/konten',
    title: t('title'),
    description: t('intro'),
    robots: { index: false, follow: false }
  });
}

function normalizeParams(p: Awaited<PageProps['searchParams']>) {
  const status = p.status && ALLOWED_STATUS.has(p.status) ? p.status : 'all';
  const type = p.type && ALLOWED_TYPES.has(p.type) ? p.type : 'both';
  const platform = p.platform ?? 'all';
  const date = p.date && ALLOWED_DATE.has(p.date) ? p.date : 'all';
  const sort = p.sort && ALLOWED_SORT.has(p.sort) ? p.sort : 'newest';
  const page = Math.max(1, Number.parseInt(p.page ?? '1', 10) || 1);
  return { status, type, platform, date, sort, page };
}

function dateFromNow(period: string): string | null {
  if (period === 'all') return null;
  const days = period === '7d' ? 7 : 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export default async function AdminKontenPage({ params, searchParams }: PageProps) {
  const rawLocale = (await params).locale;
  const locale = (routing.locales.includes(rawLocale as Locale) ? rawLocale : routing.defaultLocale) as Locale;
  setRequestLocale(locale);

  if (!(await isAdmin())) {
    redirect({ href: '/masuk', locale });
  }

  const sp = normalizeParams(await searchParams);
  const supabase = createSupabaseService() ?? (await createSupabaseServer());

  // Platforms for the filter (from DB)
  let platformOptions: { slug: string; display_name: string }[] = [];
  if (supabase) {
    const { data } = await supabase
      .from('platforms')
      .select('slug, display_name')
      .eq('is_active', true)
      .order('slug');
    platformOptions = (data ?? []) as { slug: string; display_name: string }[];
    for (const p of platformOptions) ALLOWED_PLATFORMS_CACHE.add(p.slug);
  }

  const platform = sp.platform !== 'all' && ALLOWED_PLATFORMS_CACHE.has(sp.platform) ? sp.platform : 'all';
  const since = dateFromNow(sp.date);
  const ascending = sp.sort === 'oldest';
  const fromRow = (sp.page - 1) * PAGE_SIZE;
  const toRow = fromRow + PAGE_SIZE - 1;

  type RequestRow = {
    id: string;
    topic: string;
    platform_slug: string;
    status: string;
    created_at: string;
    target_category: string | null;
    attempts: number;
  };
  type DraftRow = {
    id: string;
    request_id: string;
    status: string;
    created_at: string;
    generated_thread: { main: { id: string; en: string } };
    affiliate_injections: { friendly_code: string; post_index: number }[];
    llm_meta?: { provider: string; model: string };
  };

  let requests: RequestRow[] = [];
  let drafts: DraftRow[] = [];
  let totalCount = 0;

  if (supabase) {
    if (sp.type === 'requests' || sp.type === 'both') {
      let q = supabase
        .from('content_requests')
        .select('id, topic, platform_slug, status, created_at, target_category, attempts', { count: 'exact' })
        .order('created_at', { ascending })
        .range(fromRow, toRow);
      if (sp.status !== 'all') q = q.eq('status', sp.status);
      if (platform !== 'all') q = q.eq('platform_slug', platform);
      if (since) q = q.gte('created_at', since);
      const { data, count } = await q;
      requests = (data ?? []) as RequestRow[];
      totalCount += count ?? 0;
    }

    if (sp.type === 'drafts' || sp.type === 'both') {
      // For drafts in "both" mode, still apply pagination per-table — combined list
      // is shown separately so the user understands pagination scope.
      let q = supabase
        .from('content_drafts')
        .select('id, request_id, status, created_at, generated_thread, affiliate_injections, llm_meta', {
          count: 'exact'
        })
        .order('created_at', { ascending })
        .range(fromRow, toRow);
      if (sp.status !== 'all') q = q.eq('status', sp.status);
      if (since) q = q.gte('created_at', since);
      const { data, count } = await q;
      drafts = (data ?? []) as DraftRow[];
      totalCount += count ?? 0;
    }
  }

  // Resolve topics for drafts
  const requestIds = Array.from(new Set(drafts.map((d) => d.request_id).filter(Boolean)));
  const topicByRequestId = new Map<string, { topic: string; platform_slug: string; target_category: string | null }>();
  if (supabase && requestIds.length > 0) {
    const { data: reqs } = await supabase
      .from('content_requests')
      .select('id, topic, platform_slug, target_category')
      .in('id', requestIds);
    for (const r of (reqs ?? []) as { id: string; topic: string; platform_slug: string; target_category: string | null }[]) {
      topicByRequestId.set(r.id, r);
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <KontenList
        requests={requests}
        drafts={drafts.map((d) => ({
          ...d,
          request: topicByRequestId.get(d.request_id) ?? null
        }))}
        platforms={platformOptions}
        filters={sp}
        page={sp.page}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={PAGE_SIZE}
      />
    </div>
  );
}
