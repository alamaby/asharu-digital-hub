import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { buildMetadata } from '@/lib/seo/metadata';
import { isAdmin } from '@/lib/auth/is-admin';
import { createSupabaseService } from '@/lib/supabase/server';
import { Link } from '@/i18n/navigation';
import {
  AutomationConfigForm,
  RetryRunForm
} from '@/components/admin/automation/AutomationForms';
import { SlotSection, type SlotRowData, type GlobalDefaults } from '@/components/admin/automation/SlotForms';
import { ErrorDigestConfigTable } from '@/components/admin/automation/ErrorDigestForms';
import { FixedProductCard } from '@/components/admin/FixedProductCard';
import { formatDateTime } from '@/lib/utils/format';
import {
  parseRunStatusFilter,
  ACTIVE_RUN_STATUSES,
  pickPrimaryTopic,
  formatRunDuration,
  RUN_PAGE_SIZE,
  type RunStatusFilter,
  type RunTopicRow
} from '@/lib/admin/automation-runs-query';
import { clampPage, escapeIlike, buildSearchOr } from '@/lib/admin/produk-query';

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    locale: 'id' as Locale,
    path: '/admin/automation',
    title: 'Automation Riset Harian',
    description: 'Riset harian otomatis → artikel (configurable by table)',
    robots: { index: false, follow: false }
  });
}

interface ConfigRow {
  id: number;
  is_enabled: boolean;
  schedule_hour: number;
  schedule_minute: number;
  timezone: string;
  schedule_window_minutes: number;
  platform_slugs: string[];
  template_slug: string | null;
  max_topics: number;
  language: string;
  tone: string;
  audience: string;
  purpose: string;
  cta_style: string;
  target_reply_count: number | null;
  product_pool_size: number;
  product_category: string | null;
  idea_generation_enabled: boolean;
  idea_product_search: boolean;
  require_cover: boolean;
  cover_max_wait_minutes: number;
  cover_max_attempts: number;
  auto_publish_article: boolean;
  max_retry_attempts: number;
  notify_on: string;
  notify_emails: string[];
  email_from: string;
  email_reply_to: string | null;
  last_run_at: string | null;
  // Kolom discovery (Fase 3 — opsional agar pre-migrasi tetap termuat).
  maximum_iterations?: number | null;
  minimum_score?: number | null;
  minimum_candidates?: number | null;
  freshness_hours?: number | null;
  // Kolom blackout (Fase 4 — opsional agar pre-migrasi tetap termuat).
  product_repeat_blackout_days?: number | null;
}

interface RunRow {
  id: string;
  run_date: string;
  status: string;
  product_id: string | null;
  session_id: string | null;
  article_draft_id: string | null;
  article_ids: string[] | null;
  cover_attempts: number;
  attempts: number;
  error_message: string | null;
  published_at: string | null;
  updated_at: string;
  created_at: string;
  /** Ditambahkan Fase 2; pre-migrasi bernilai null. */
  slot_key?: string | null;
}

interface ProductCard {
  id: string;
  friendly_code: string;
  name_id: string;
  image: string | null;
  merchant: string | null;
  category: string | null;
  url: string | null;
}

interface EmailLogRow {
  id: string;
  run_id: string | null;
  moment: 'draft_ready' | 'published' | 'failure' | 'test' | 'error_digest';
  ok: boolean;
  skipped: boolean;
  resend_id: string | null;
  error: string | null;
  created_at: string;
}

/** Grup log email per run_id (hanya momen yang relevan bagi UI). */
type EmailLogMap = Map<string, Array<{ moment: string; ok: boolean; skipped: boolean; resend_id: string | null; error: string | null }>>;

function buildEmailLogMap(rows: EmailLogRow[] | null): EmailLogMap {
  const map = new Map<string, Array<{ moment: string; ok: boolean; skipped: boolean; resend_id: string | null; error: string | null }>>();
  if (!rows) return map;
  for (const r of rows) {
    if (!r.run_id) continue;
    const list = map.get(r.run_id) ?? [];
    list.push({ moment: r.moment, ok: r.ok, skipped: r.skipped, resend_id: r.resend_id, error: r.error });
    map.set(r.run_id, list);
  }
  return map;
}

function classifyResendErrorSnippet(error: string | null): { label: string; hint: string } | null {
  if (!error) return null;
  const lower = error.toLowerCase();
  if (lower.includes('not authorized to send emails from')) {
    return { label: 'domain pengirim belum terverifikasi / key tak berhak kirim dari domain ini', hint: 'domain pengirim belum terverifikasi di Resend / key tak berhak kirim dari domain ini — cek Resend Domains & API Keys' };
  }
  if (lower.includes('domain is not verified') || lower.includes('not verified')) {
    return { label: 'domain pengirim belum diverifikasi di Resend', hint: 'domain belum diverifikasi via DNS di Resend — verifikasi sebelum pakai email tersebut' };
  }
  if (lower.includes('api key is invalid') || lower.includes('authentication required') || lower.includes('invalid api key')) {
    return { label: 'key Resend tidak valid atau kedaluwarsa', hint: 'API key Resend tidak valid — periksa Vault atau buat key baru di Resend Dashboard' };
  }
  return null;
}

function renderEmailBadge(logs: Array<{ moment: string; ok: boolean; skipped: boolean; resend_id: string | null; error: string | null }>): React.JSX.Element | null {
  // Urutkan: published terakhir (paling meaningful), lalu draft_ready, lalu failure.
  const sorted = logs
    .filter((l) => l.moment !== 'test')
    .sort((a, b) => {
      const order: Record<string, number> = { published: 1, draft_ready: 2, failure: 3 };
      return (order[a.moment] ?? 9) - (order[b.moment] ?? 9);
    });
  if (sorted.length === 0) {
    return (
      <span className="ml-2 text-xs text-ink-muted" title="Belum ada percobaan email untuk run ini">
        belum ada percobaan
      </span>
    );
  }
  // Ambil log published dulu, fallback draft_ready, fallback failure terbaru.
  const published = sorted.find((l) => l.moment === 'published');
  const draftReady = sorted.find((l) => l.moment === 'draft_ready');
  const failure = sorted.find((l) => l.moment === 'failure');
  const primary = published ?? draftReady ?? failure;
  if (!primary) return null;
  if (primary.ok) {
    return (
      <span className="ml-2 inline-flex items-center gap-1 text-xs text-green-700" title={`resend id ${primary.resend_id ?? '?'}`}>
        ● terkirim{primary.resend_id ? ` (${primary.resend_id.slice(0, 8)}...)` : ''}
      </span>
    );
  }
  if (primary.skipped) {
    const reason = primary.error === 'no recipients' ? 'tanpa penerima'
      : primary.error === 'resend key not configured' ? 'key Resend belum dikonfigurasi'
      : primary.error?.slice(0, 60) ?? 'dilewati';
    return (
      <span className="ml-2 text-xs text-amber-700" title={reason}>
        ○ dilewati: {reason}
      </span>
    );
  }
  const classified = classifyResendErrorSnippet(primary.error);
  const body = classified?.label ?? primary.error?.slice(0, 80) ?? 'resend error';
  const title = classified?.hint ?? (primary.error ?? 'gagal kirim');
  return (
    <span className="ml-2 text-xs text-red-700" title={title}>
      ● gagal: {body}
    </span>
  );
}
// Nilai null/undefined dari Supabase dinormalkan agar props serializable
// dan cocok dengan tipe form client.
import type { ConfigFormData } from '@/components/admin/automation/AutomationForms';

function toConfigFormData(cfg: ConfigRow): ConfigFormData {
  return {
    is_enabled: cfg.is_enabled,
    schedule_hour: cfg.schedule_hour,
    schedule_minute: cfg.schedule_minute,
    timezone: cfg.timezone,
    schedule_window_minutes: cfg.schedule_window_minutes,
    platform_slugs: cfg.platform_slugs ?? [],
    template_slug: cfg.template_slug,
    max_topics: cfg.max_topics,
    language: cfg.language,
    tone: cfg.tone,
    audience: cfg.audience,
    purpose: cfg.purpose,
    cta_style: cfg.cta_style,
    target_reply_count: cfg.target_reply_count,
    product_pool_size: cfg.product_pool_size,
    product_category: cfg.product_category,
    product_repeat_blackout_days: cfg.product_repeat_blackout_days ?? 14,
    idea_generation_enabled: cfg.idea_generation_enabled ?? false,
    idea_product_search: cfg.idea_product_search ?? true,
    require_cover: cfg.require_cover,
    cover_max_wait_minutes: cfg.cover_max_wait_minutes,
    cover_max_attempts: cfg.cover_max_attempts,
    auto_publish_article: cfg.auto_publish_article,
    max_retry_attempts: cfg.max_retry_attempts,
    notify_on: cfg.notify_on,
    notify_emails: cfg.notify_emails ?? [],
    email_from: cfg.email_from,
    email_reply_to: cfg.email_reply_to,
    last_run_at: cfg.last_run_at
  };
}

/** Turunkan global defaults untuk placeholder override per-slot. */
function toGlobalDefaults(cfg: ConfigRow): GlobalDefaults {
  return {
    max_topics: cfg.max_topics,
    product_pool_size: cfg.product_pool_size,
    language: cfg.language,
    tone: cfg.tone,
    audience: cfg.audience,
    purpose: cfg.purpose,
    cta_style: cfg.cta_style,
    target_reply_count: cfg.target_reply_count,
    template_slug: cfg.template_slug,
    maximum_iterations: cfg.maximum_iterations ?? null,
    minimum_score: cfg.minimum_score ?? null,
    minimum_candidates: cfg.minimum_candidates ?? null,
    freshness_hours: cfg.freshness_hours ?? null,
    cover_max_wait_minutes: cfg.cover_max_wait_minutes,
    cover_max_attempts: cfg.cover_max_attempts,
    max_retry_attempts: cfg.max_retry_attempts,
    notify_on: cfg.notify_on,
    notify_emails: cfg.notify_emails ?? null,
    idea_generation_enabled: cfg.idea_generation_enabled ?? false,
    idea_product_search: cfg.idea_product_search ?? true,
    require_cover: cfg.require_cover,
    auto_publish_article: cfg.auto_publish_article,
    email_from: cfg.email_from,
    email_reply_to: cfg.email_reply_to,
    product_category: cfg.product_category
  };
}

function buildPaginationHref(base: '/admin/automation', sp: { runPage?: string; runStatus?: string; runSlot?: string; q?: string }, page: number): { pathname: '/admin/automation'; query: Record<string, string> } {
  const params: Record<string, string> = { runPage: String(page) };
  if (sp.runStatus) params.runStatus = sp.runStatus;
  if (sp.runSlot) params.runSlot = sp.runSlot;
  if (sp.q) params.q = sp.q;
  return { pathname: base, query: params };
}

export default async function AutomationAdminPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ runPage?: string; runStatus?: string; runSlot?: string; q?: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = (routing.locales.includes(rawLocale as Locale) ? rawLocale : routing.defaultLocale) as Locale;
  setRequestLocale(locale);
  if (!(await isAdmin())) redirect({ href: '/masuk', locale });
  const supabase = createSupabaseService();
  if (!supabase) throw new Error('Supabase not configured — set SUPABASE_SECRET_KEY');

  const sp = await searchParams;
  const runStatus: RunStatusFilter = parseRunStatusFilter(sp.runStatus);
  const rawQ = (sp.q ?? '').trim();
  const q = rawQ.slice(0, 80);

  const [{ data: config }, { data: platforms }, { data: templates }, { data: emailLogs }, { data: slots }, { data: digestConfigs }, { data: allSlotRows }] =
    await Promise.all([
      supabase.from('automation_configs').select('*').eq('id', 1).maybeSingle(),
      supabase.from('platforms').select('slug, display_name').eq('is_active', true).neq('slug', 'all').order('slug'),
      supabase.from('research_templates').select('slug, display_name').eq('is_active', true).order('sort_order'),
      supabase
        .from('automation_email_log')
        .select('run_id, moment, ok, skipped, resend_id, error, created_at')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('automation_schedules')
        .select(
          'slot_key, label, hour, minute, weekdays, is_enabled, window_minutes, priority, ' +
          'platform_slugs, max_topics, product_pool_size, product_category, auto_publish_article, require_cover, ' +
          'notify_on, notify_emails, maximum_iterations, minimum_score, minimum_candidates, freshness_hours, ' +
          'cover_max_wait_minutes, cover_max_attempts, max_retry_attempts, language, tone, audience, purpose, ' +
          'cta_style, target_reply_count, template_slug, idea_generation_enabled, idea_product_search, ' +
          'email_from, email_reply_to, updated_at'
        )
        .order('priority', { ascending: true })
        .order('hour', { ascending: true })
        .order('minute', { ascending: true }),
      supabase
        .from('error_notification_configs')
        .select('category, is_enabled, digest_window_minutes, notify_emails, last_digest_at')
        .order('category'),
      supabase
        .from('automation_schedules')
        .select('slot_key, label')
        .order('priority')
    ]);

  const cfg = config as ConfigRow | null;
  const platformRows = (platforms as { slug: string; display_name: string }[] | null) ?? [];
  const templateRows = (templates as { slug: string; display_name: string }[] | null) ?? [];
  const emailLogMap = buildEmailLogMap(emailLogs as EmailLogRow[] | null);
  const slotRows = (slots as SlotRowData[] | null) ?? [];
  const allSlots = (allSlotRows as { slot_key: string; label: string }[] | null) ?? [];
  const globalDefaults = cfg ? toGlobalDefaults(cfg) : ({} as GlobalDefaults);
  const digestConfigRows = (digestConfigs as Array<{ category: string; is_enabled: boolean; digest_window_minutes: number; notify_emails: string[] | null; last_digest_at: string | null }> | null) ?? [];

  // Turunka runSlot yang valid hanya dari slot yang ada.
  const runSlot = (sp.runSlot && allSlots.some((s) => s.slot_key === sp.runSlot)) ? sp.runSlot : 'all';

  // Bangun filter status.
  let statusFilter: { in?: string[]; eq?: string } | undefined;
  if (runStatus === 'active') statusFilter = { in: [...ACTIVE_RUN_STATUSES] };
  else if (runStatus === 'completed') statusFilter = { eq: 'completed' };
  else if (runStatus === 'failed') statusFilter = { eq: 'failed' };

  // Bangun filter slot (bila bukan 'all').
  const slotFilter = runSlot !== 'all' ? { eq: runSlot } : undefined;

  // Query runs utama + count.
  const runBaseQuery = supabase
    .from('automation_runs')
    .select('id, run_date, status, product_id, session_id, article_draft_id, article_ids, cover_attempts, attempts, error_message, published_at, updated_at, created_at, slot_key', { count: 'exact' })
    .order('run_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (statusFilter) {
    if ('in' in (statusFilter as object)) {
      runBaseQuery.in('status', (statusFilter as { in: string[] }).in);
    } else {
      runBaseQuery.eq('status', (statusFilter as { eq: string }).eq);
    }
  }
  if (slotFilter) runBaseQuery.eq('slot_key', slotFilter.eq);

  // Search produk/topik: batch ID terlebih dahulu (cap 50 agar URL PostgREST aman).
  let productIds: string[] = [];
  let sessionIds: string[] = [];
  if (q) {
    const esc = escapeIlike(q);
    const [pRes, sRes] = await Promise.all([
      supabase.from('affiliate_products').select('id').or(buildSearchOr(q) ?? '').limit(50),
      supabase.from('content_research_topics').select('session_id').ilike('topic', `%${esc}%`).limit(50)
    ]);
    productIds = ((pRes.data ?? []) as { id: string }[]).map((r) => r.id);
    sessionIds = ((sRes.data ?? []) as { session_id: string }[]).map((r) => r.session_id);
  }

  const hasSearch = q !== '';
  let totalCount = 0;
  let runRows: RunRow[] = [];

  if (!hasSearch || productIds.length > 0 || sessionIds.length > 0) {
    const mainQ = runBaseQuery.range(0, RUN_PAGE_SIZE - 1);
    if (hasSearch) {
      const orParts: string[] = [];
      if (productIds.length > 0) orParts.push(`product_id.in.(${productIds.join(',')})`);
      if (sessionIds.length > 0) orParts.push(`session_id.in.(${sessionIds.join(',')})`);
      if (orParts.length > 0) mainQ.or(orParts.join(','));
    }
    const { data, count } = await mainQ;
    totalCount = count ?? 0;
    runRows = (data ?? []) as RunRow[];
  } else {
    // q non-kosong tapi tidak cocot produk/topik manapun → kosong.
    totalCount = 0;
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / RUN_PAGE_SIZE));
  const page = clampPage(sp.runPage, totalPages);

  // Offset halaman saat ini (page 1-indexed).
  const offset = (page - 1) * RUN_PAGE_SIZE;
  // Re-query dengan offset yang benar (step di atas mengambil halaman 1; timpa dengan halaman yang diminta).
  if (page !== 1) {
    const paginatedQ = runBaseQuery.range(offset, offset + RUN_PAGE_SIZE - 1);
    if (hasSearch) {
      const orParts: string[] = [];
      if (productIds.length > 0) orParts.push(`product_id.in.(${productIds.join(',')})`);
      if (sessionIds.length > 0) orParts.push(`session_id.in.(${sessionIds.join(',')})`);
      if (orParts.length > 0) paginatedQ.or(orParts.join(','));
    }
    const { data } = await paginatedQ;
    runRows = (data ?? []) as RunRow[];
  }

  // Batch produk + topik untuk render card/topik.
  const pIds = [...new Set(runRows.map((r) => r.product_id).filter(Boolean))] as string[];
  const productMap = new Map<string, ProductCard>();
  if (pIds.length > 0) {
    const { data: prodData } = await supabase
      .from('affiliate_products')
      .select('id, friendly_code, name_id, image, merchant, category, url')
      .in('id', pIds);
    for (const p of (prodData ?? []) as ProductCard[]) {
      productMap.set(p.id, p);
    }
  }
  const sIds = [...new Set(runRows.map((r) => r.session_id).filter(Boolean))] as string[];
  const topicRows: RunTopicRow[] = [];
  if (sIds.length > 0) {
    const { data: tData } = await supabase
      .from('content_research_topics')
      .select('session_id, topic, rank, status')
      .in('session_id', sIds)
      .order('rank');
    topicRows.push(...((tData ?? []) as RunTopicRow[]));
  }
  // Fallback sesi bila topik tidak tersedia.
  const emptySessionIds = runRows
    .map((r) => r.session_id)
  .filter((sid) => sid && !topicRows.some((t) => t.session_id === sid));
  if (emptySessionIds.length > 0) {
    const { data: sData } = await supabase
      .from('content_research_sessions')
      .select('id, topic')
      .in('id', emptySessionIds);
    for (const s of (sData ?? []) as { id: string; topic: string | null }[]) {
      topicRows.push({ session_id: s.id, topic: s.topic, rank: null, status: null });
    }
  }
  const topicMap = new Map<string, string | null>();
  for (const sid of [...new Set(runRows.map((r) => r.session_id).filter(Boolean))] as string[]) {
    topicMap.set(sid, pickPrimaryTopic(topicRows, sid));
  }

  const tz = cfg?.timezone ?? 'Asia/Jakarta';

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-4 text-sm">
        <Link href={{ pathname: '/admin' }} className="text-primary hover:underline">← Dasbor</Link>
      </div>
      <h1 className="text-2xl font-bold text-ink">Automation Riset Harian</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Cron tiap 5 menit, gated ke jam lokal di bawah, maksimal 1 run/hari.
        Alur: pilih acak 1 produk → generate ide dari mekanisme produk (bila aktif) →
        riset (1 topik) → draf artikel/twitter/threads → cover wajib ter-render → publish artikel → email Resend.
        Semua knob di tabel — perubahan langsung dipakai tanpa deploy.
      </p>

      {!cfg ? (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Baris config (id=1) belum ada — jalankan migrasi `20260915000003_automation_config.sql`.
        </p>
      ) : (
        <AutomationConfigForm
          cfg={toConfigFormData(cfg)}
          platformRows={platformRows}
          templateRows={templateRows}
        />
      )}

      <SlotSection
        slots={slotRows}
        platforms={platformRows}
        templates={templateRows}
        globalDefaults={globalDefaults}
      />

      <h2 className="mt-8 text-lg font-semibold text-ink">Notifikasi error (digest)</h2>
      {digestConfigRows.length === 0 ? (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Tabel config digest belum ada — jalankan migrasi `20260922000001_error_digest_queue.sql`.
        </p>
      ) : (
        <ErrorDigestConfigTable rows={digestConfigRows} />
      )}
      <p className="mt-2 text-xs text-ink-muted">
        Email failure langsung telah dimigrasikan ke digest (1 email per jendela).
      </p>

      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Riwayat run</h2>
          <p className="text-xs text-ink-muted">{totalCount} run · halaman {page} dari {totalPages}</p>
        </div>
        <form className="mt-3 flex flex-wrap items-end gap-2" method="get">
          <input type="hidden" name="runPage" value="1" />
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-ink-muted">
              Status
              <select name="runStatus" defaultValue={runStatus} className="ml-1 rounded border border-line bg-background px-2 py-1 text-xs">
                <option value="all">Semua</option>
                <option value="active">Aktif</option>
                <option value="completed">Selesai</option>
                <option value="failed">Gagal</option>
              </select>
            </label>
            <label className="text-xs text-ink-muted">
              Slot
              <select name="runSlot" defaultValue={runSlot} className="ml-1 rounded border border-line bg-background px-2 py-1 text-xs">
                <option value="all">Semua slot</option>
                {allSlots.map((s) => (
                  <option key={s.slot_key} value={s.slot_key}>{s.label ?? s.slot_key}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-ink-muted flex-1 min-w-[180px]">
              Cari produk/topik
              <input
                type="text"
                name="q"
                defaultValue={q}
                placeholder="nama / kode / merchant / kata topik"
                className="ml-1 w-full rounded border border-line bg-background px-2 py-1 text-xs"
              />
            </label>
            {q || runStatus !== 'all' || runSlot !== 'all' ? (
              <Link
                href={buildPaginationHref('/admin/automation' as const, sp, page)}
                className="rounded border border-line px-2 py-1 text-xs hover:bg-background"
              >
                Reset
              </Link>
            ) : null}
          </div>
        </form>
      </div>

      <div className="mt-3 space-y-3">
        {runRows.map((r) => {
          const prod = r.product_id ? productMap.get(r.product_id) : null;
          const topik = r.session_id ? (topicMap.get(r.session_id) ?? null) : null;
          const endTime = r.published_at ?? r.updated_at;
          return (
            <div key={r.id} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">
                    {r.run_date} · <span className="font-mono text-xs">{r.status}</span>
                    {r.attempts > 0 ? <span className="ml-2 text-xs text-ink-muted">retry {r.attempts}</span> : null}
                    {renderEmailBadge(emailLogMap.get(r.id) ?? [])}
                  </p>
                  {prod ? (
                    <FixedProductCard title="Produk" products={[{
                      id: prod.id,
                      friendly_code: prod.friendly_code ?? '',
                      name_id: prod.name_id ?? '',
                      image: prod.image,
                      merchant: prod.merchant,
                      category: prod.category,
                      url: prod.url
                    }]} />
                  ) : (
                    <p className="mt-1 text-xs text-ink-muted">
                      produk <span className="font-mono">{r.product_id?.slice(0, 8) ?? '—'}</span> ·
                      sesi <span className="font-mono">{r.session_id?.slice(0, 8) ?? '—'}</span> ·
                      draf <span className="font-mono">{r.article_draft_id?.slice(0, 8) ?? '—'}</span> ·
                      cover percobaan {r.cover_attempts}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-ink-muted">
                    Mulai {formatDateTime(r.created_at ?? r.run_date, locale, tz)} ·
                    {' '}Selesai {endTime ? formatDateTime(endTime, locale, tz) : '—'}
                    {' '}· durasi {formatRunDuration(r.created_at ?? r.run_date, endTime)}
                  </p>
                  {topik ? (
                    <p className="mt-1 text-xs text-ink-muted">Topik: {topik}</p>
                  ) : (
                    <p className="mt-1 text-xs text-ink-muted">Topik: Topik belum tersedia</p>
                  )}
                  {r.published_at ? (
                    <p className="mt-1 text-xs text-green-700">
                      {(r.article_ids ?? []).length} artikel terbit
                    </p>
                  ) : null}
                  {r.error_message ? <p className="mt-1 text-xs text-red-700">{r.error_message}</p> : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  {r.session_id ? (
                    <Link
                      href={{ pathname: '/admin/riset/[sessionId]', params: { sessionId: r.session_id } }}
                      className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink hover:bg-background"
                    >
                      Lihat sesi
                    </Link>
                  ) : null}
                  {r.status === 'failed' && r.session_id ? (
                    <RetryRunForm runId={r.id} />
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
        {runRows.length === 0 ? (
          <p className="text-sm text-ink-muted">
            {hasSearch ? 'Tidak ada run yang cocok dengan filter/pencarian.' : 'Belum ada run. Aktifkan kill-switch lalu klik &quot;Run now&quot; untuk uji coba.'}
          </p>
        ) : null}
      </div>

      {totalPages > 1 ? (
        <nav className="mt-4 flex items-center justify-between gap-2" aria-label="Navigasi riwayat run">
          <Link
            href={buildPaginationHref('/admin/automation', sp, Math.max(1, page - 1))}
            className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
          >
            ← Sebelumnya
          </Link>
          <p className="text-xs text-ink-muted">
            Halaman {page} dari {totalPages}
          </p>
          <Link
            href={buildPaginationHref('/admin/automation', sp, Math.min(totalPages, page + 1))}
            className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
          >
            Berikutnya →
          </Link>
        </nav>
      ) : null}
    </div>
  );
}
