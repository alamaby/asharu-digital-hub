import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { buildMetadata } from '@/lib/seo/metadata';
import { createSupabaseServer } from '@/lib/supabase/server';
import { AdminTopBar } from '@/components/admin/AdminTopBar';
import { ReviewListClient } from '@/components/admin/ReviewListClient';

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; provider?: string; platform?: string; date?: string; sort?: string; page?: string }>;
}

const PAGE_SIZE = 12;
const ALLOWED_STATUS = new Set(['needs_review', 'approved', 'rejected']);
const ALLOWED_PROVIDER = new Set(['naraya', 'openrouter', 'gemini', 'cloudflare']);
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
  const status = p.status && ALLOWED_STATUS.has(p.status) ? p.status : 'all';
  const provider = p.provider && ALLOWED_PROVIDER.has(p.provider) ? p.provider : 'all';
  const platform = p.platform ?? 'all';
  const date = p.date && ALLOWED_DATE.has(p.date) ? p.date : 'all';
  const sort = p.sort && ALLOWED_SORT.has(p.sort) ? p.sort : 'newest';
  const page = Math.max(1, Number.parseInt(p.page ?? '1', 10) || 1);
  return { status, provider, platform, date, sort, page };
}

function dateFromNow(period: string): string | null {
  if (period === 'all') return null;
  const days = period === '7d' ? 7 : 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

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
  const since = dateFromNow(sp.date);
  const ascending = sp.sort === 'oldest';
  const fromRow = (sp.page - 1) * PAGE_SIZE;
  const toRow = fromRow + PAGE_SIZE - 1;

  // Fetch drafts with filters — provider via jsonb, status/date/sort/pagination server-side
  let query = supabase.from('content_drafts').select('*', { count: 'exact' }).order('created_at', { ascending }).range(fromRow, toRow);
  if (sp.status !== 'all') query = query.eq('status', sp.status);
  if (sp.provider !== 'all') query = query.eq('llm_meta->>provider' as never, sp.provider as never);
  if (since) query = query.gte('created_at', since);

  // Platform filter via research session join — two-step
  let platformFilteredIds: Set<string> | null = null;
  if (sp.platform !== 'all') {
    const { data: platSessions } = await supabase.from('content_research_sessions').select('id').eq('platform_slug', sp.platform);
    const platSessionIds = new Set(((platSessions ?? []) as { id: string }[]).map((r) => r.id));
    // Also fetch legacy platform via content_requests for drafts without research_topic_id? For now filter by session ids only
    if (platSessionIds.size > 0) {
      const { data: topicRows } = await supabase.from('content_research_topics').select('id, session_id').in('session_id', [...platSessionIds]);
      const topicIds = new Set(((topicRows ?? []) as { id: string }[]).map((r) => r.id));
      // If filtering by platform, we will post-filter drafts by research_topic_id or request_id membership
      platformFilteredIds = new Set([...platSessionIds, ...topicIds]);
    } else {
      platformFilteredIds = new Set();
    }
  }

  const { data: draftsRaw, count, error: draftsError } = await query;
  let drafts = (draftsRaw ?? []) as unknown as DraftListCardImport[];
  if (platformFilteredIds !== null) {
    drafts = drafts.filter((d) => {
      const rt = (d as unknown as { research_topic_id?: string | null; request_id?: string | null }).research_topic_id;
      const rq = (d as unknown as { request_id?: string | null }).request_id;
      return (rt && platformFilteredIds!.has(rt)) || (rq && platformFilteredIds!.has(rq));
    });
  }
  if (draftsError) {
    // fallback to unfiltered if jsonb filter fails
    const { data: fallback } = await supabase.from('content_drafts').select('*').order('created_at', { ascending: false }).limit(PAGE_SIZE);
    drafts = (fallback ?? []) as unknown as DraftListCardImport[];
  }

  const totalCount = count ?? drafts.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Platform options for filter
  const { data: platOpts } = await supabase.from('platforms').select('slug, display_name').eq('is_active', true).order('slug');
  const platformOptions = (platOpts ?? []) as { slug: string; display_name: string }[];

  return (
    <div>
      <AdminTopBar />
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">{t('title')}</h1>
        <p className="mt-2 text-sm text-ink-muted">{t('realtime')}</p>

        <ReviewListClient drafts={drafts as never} platforms={platformOptions} filters={sp} page={sp.page} totalPages={totalPages} totalCount={totalCount} pageSize={PAGE_SIZE} locale={locale} error={draftsError?.message ?? null} />
      </div>
    </div>
  );
}

interface DraftListCardImport {
  id: string;
  status: string;
  created_at: string;
  generated_thread: { main: { id: string; en: string }; replies: { id: string; en: string }[] };
  affiliate_injections: { friendly_code: string; product_name_id?: string; product_image?: string; match_score?: number }[];
  llm_meta?: { provider: string; model: string };
}
