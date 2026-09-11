import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { buildMetadata } from '@/lib/seo/metadata';
import { createSupabaseService, createSupabaseServer } from '@/lib/supabase/server';
import { getDisplayTimezone } from '@/lib/auth/timezone';
import { isAdmin } from '@/lib/auth/is-admin';
import { KontenList } from '@/components/admin/KontenList';
import {
  normalizeKontenSort,
  paginateKonten,
  parsePlatformParam,
  sortKontenItems,
  type KontenItem
} from '@/lib/admin/konten-list';

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    status?: string;
    type?: string;
    platform?: string;
    date?: string;
    sort?: string;
    dir?: string;
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
const ALLOWED_TYPES = new Set(['requests', 'drafts', 'both']);
const ALLOWED_DATE = new Set(['all', '7d', '30d']);

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
  const date = p.date && ALLOWED_DATE.has(p.date) ? p.date : 'all';
  const page = Math.max(1, Number.parseInt(p.page ?? '1', 10) || 1);
  return { status, type, platformRaw: p.platform, date, sortRaw: p.sort, dirRaw: p.dir, page };
}

function dateFromNow(period: string): string | null {
  if (period === 'all') return null;
  const days = period === '7d' ? 7 : 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

interface RequestRow {
  id: string;
  topic: string;
  platform_slug: string;
  status: string;
  created_at: string;
  target_category: string | null;
  attempts: number;
}

interface DraftRow {
  id: string;
  request_id: string | null;
  research_topic_id: string | null;
  platform_slug: string | null;
  status: string;
  created_at: string;
  llm_meta?: { provider?: string; model?: string } | null;
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
  }
  const allowedSlugs = new Set(platformOptions.map((p) => p.slug));
  // Multi-select: `?platform=threads,facebook`. Kosong = semua platform.
  const selectedPlatforms = parsePlatformParam(sp.platformRaw, allowedSlugs);
  const { sort, dir } = normalizeKontenSort(sp.sortRaw, sp.dirRaw);
  const since = dateFromNow(sp.date);

  let items: KontenItem[] = [];

  if (supabase) {
    // --- Requests (legacy content_requests) ---
    let requests: RequestRow[] = [];
    if (sp.type === 'requests' || sp.type === 'both') {
      let q = supabase
        .from('content_requests')
        .select('id, topic, platform_slug, status, created_at, target_category, attempts');
      if (sp.status !== 'all') q = q.eq('status', sp.status);
      if (selectedPlatforms.length > 0) q = q.in('platform_slug', selectedPlatforms);
      if (since) q = q.gte('created_at', since);
      const { data } = await q;
      requests = (data ?? []) as RequestRow[];
    }

    // --- Drafts (legacy + riset). Filter platform in-memory karena platform
    // draft riset tersimpan di kolom platform_slug ATAU llm_meta.platform. ---
    let drafts: DraftRow[] = [];
    if (sp.type === 'drafts' || sp.type === 'both') {
      let q = supabase
        .from('content_drafts')
        .select('id, request_id, research_topic_id, platform_slug, status, created_at, llm_meta');
      if (sp.status !== 'all') q = q.eq('status', sp.status);
      if (since) q = q.gte('created_at', since);
      const { data } = await q;
      drafts = (data ?? []) as DraftRow[];
    }

    // Resolve topik: legacy via content_requests, riset via
    // content_research_topics (fallback: content_research_sessions).
    const legacyById = new Map<string, RequestRow>();
    if (drafts.length > 0) {
      const legacyIds = Array.from(new Set(drafts.map((d) => d.request_id).filter((v): v is string => !!v)));
      if (legacyIds.length > 0) {
        const { data: reqs } = await supabase
          .from('content_requests')
          .select('id, topic, platform_slug, status, created_at, target_category, attempts')
          .in('id', legacyIds);
        for (const r of (reqs ?? []) as RequestRow[]) legacyById.set(r.id, r);
      }
    }
    const topicById = new Map<string, { topic: string; category: string | null }>();
    const topicIds = Array.from(new Set(drafts.map((d) => d.research_topic_id).filter((v): v is string => !!v)));
    if (topicIds.length > 0) {
      const { data: topics } = await supabase
        .from('content_research_topics')
        .select('id, topic, category')
        .in('id', topicIds);
      for (const t of (topics ?? []) as { id: string; topic: string; category: string | null }[]) {
        topicById.set(t.id, { topic: t.topic, category: t.category });
      }
    }
    const sessionById = new Map<string, { topic: string | null; target_category: string | null }>();
    const sessionIds = Array.from(
      new Set(
        drafts
          .filter((d) => (d.research_topic_id == null || !topicById.has(d.research_topic_id)) && d.request_id && !legacyById.has(d.request_id))
          .map((d) => d.request_id as string)
      )
    );
    if (sessionIds.length > 0) {
      const { data: sessions } = await supabase
        .from('content_research_sessions')
        .select('id, topic, target_category')
        .in('id', sessionIds);
      for (const s of (sessions ?? []) as { id: string; topic: string | null; target_category: string | null }[]) {
        sessionById.set(s.id, { topic: s.topic, target_category: s.target_category });
      }
    }

    const draftPlatform = (d: DraftRow): string | null =>
      d.platform_slug ?? (d.llm_meta as { platform?: string } | null)?.platform ?? null;

    const merged: KontenItem[] = [
      ...requests.map((r): KontenItem => ({
        kind: 'request',
        id: r.id,
        topic: r.topic,
        platform: r.platform_slug,
        status: r.status,
        category: r.target_category,
        provider: null,
        model: null,
        createdAt: r.created_at,
        attempts: r.attempts
      })),
      ...drafts.map((d): KontenItem => {
        const legacy = d.request_id ? legacyById.get(d.request_id) : undefined;
        const research = d.research_topic_id ? topicById.get(d.research_topic_id) : undefined;
        const session = d.request_id && !legacy ? sessionById.get(d.request_id) : undefined;
        return {
          kind: 'draft',
          id: d.id,
          topic: legacy?.topic ?? research?.topic ?? session?.topic ?? null,
          platform: legacy?.platform_slug ?? draftPlatform(d),
          status: d.status,
          category: legacy?.target_category ?? research?.category ?? session?.target_category ?? null,
          provider: d.llm_meta?.provider ?? null,
          model: d.llm_meta?.model ?? null,
          createdAt: d.created_at,
          attempts: null
        };
      })
    ];

    // Filter platform untuk draft (requests sudah difilter di DB).
    const filtered =
      selectedPlatforms.length === 0
        ? merged
        : merged.filter((m) => m.kind === 'request' || (m.platform != null && selectedPlatforms.includes(m.platform)));
    items = sortKontenItems(filtered, sort, dir);
  }

  const { pageItems, page, totalPages, totalCount } = paginateKonten(items, sp.page, PAGE_SIZE);
  const timeZone = await getDisplayTimezone();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <KontenList
        items={pageItems}
        platforms={platformOptions}
        filters={{ status: sp.status, type: sp.type, platform: selectedPlatforms, date: sp.date, sort, dir }}
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={PAGE_SIZE}
        timeZone={timeZone}
        locale={locale}
      />
    </div>
  );
}
