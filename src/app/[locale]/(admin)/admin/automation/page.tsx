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
  /** Ditambahkan Fase 2; pre-migrasi bernilai null. */
  slot_key?: string | null;
}

interface EmailLogRow {
  id: string;
  run_id: string | null;
  moment: 'draft_ready' | 'published' | 'failure' | 'test';
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

function renderEmailBadge(logs: Array<{ moment: string; ok: boolean; skipped: boolean; resend_id: string | null; error: string | null }>): React.JSX.Element | null {
  // Urutkan: published terakhir (paling meaningful), lalu draft_ready.
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
  // Ambil log published dulu, fallback draft_ready.
  const published = sorted.find((l) => l.moment === 'published');
  const draftReady = sorted.find((l) => l.moment === 'draft_ready');
  const primary = published ?? draftReady;
  if (!primary) return null;
  if (primary.ok) {
    return (
      <span className="ml-2 inline-flex items-center gap-1 text-xs text-green-700" title={`resend id ${primary.resend_id ?? '?'}`}>
        ● terkirim{primary.resend_id ? ` (${primary.resend_id.slice(0, 8)}…)` : ''}
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
  return (
    <span className="ml-2 text-xs text-red-700" title={primary.error ?? 'gagal kirim'}>
      ● gagal: {primary.error?.slice(0, 80) ?? 'resend error'}
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

export default async function AutomationAdminPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = (routing.locales.includes(rawLocale as Locale) ? rawLocale : routing.defaultLocale) as Locale;
  setRequestLocale(locale);
  if (!(await isAdmin())) redirect({ href: '/masuk', locale });
  const supabase = createSupabaseService();
  if (!supabase) throw new Error('Supabase not configured — set SUPABASE_SECRET_KEY');

  const [{ data: config }, { data: runs }, { data: platforms }, { data: templates }, { data: emailLogs }, { data: slots }] =
    await Promise.all([
      supabase.from('automation_configs').select('*').eq('id', 1).maybeSingle(),
      supabase
        .from('automation_runs')
        .select(
          'id, run_date, status, product_id, session_id, article_draft_id, article_ids, cover_attempts, attempts, error_message, published_at, updated_at, slot_key'
        )
        .order('run_date', { ascending: false })
        .limit(20),
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
        .order('minute', { ascending: true })
    ]);

  const cfg = config as ConfigRow | null;
  const runRows = (runs as RunRow[] | null) ?? [];
  const platformRows = (platforms as { slug: string; display_name: string }[] | null) ?? [];
  const templateRows = (templates as { slug: string; display_name: string }[] | null) ?? [];
  const emailLogMap = buildEmailLogMap(emailLogs as EmailLogRow[] | null);
  const slotRows = (slots as SlotRowData[] | null) ?? [];
  const globalDefaults = cfg ? toGlobalDefaults(cfg) : ({} as GlobalDefaults);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-4 text-sm">
        <Link href={{ pathname: '/admin' }} className="text-primary hover:underline">← Dasbor</Link>
      </div>
      <h1 className="text-2xl font-bold text-ink">Automation Riset Harian</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Cron tiap 5 menit, gated ke jam lokal di bawah, maksimal 1 run/hari.         Alur: pilih acak 1 produk → generate ide dari mekanisme produk (bila aktif) →
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

      <h2 className="mt-8 text-lg font-semibold text-ink">Riwayat run (20 terbaru)</h2>
      <div className="mt-3 space-y-3">
        {runRows.map((r) => (
          <div key={r.id} className="rounded-xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">
                  {r.run_date} · <span className="font-mono text-xs">{r.status}</span>
                  {r.attempts > 0 ? <span className="ml-2 text-xs text-ink-muted">retry {r.attempts}</span> : null}
                  {renderEmailBadge(emailLogMap.get(r.id) ?? [])}
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                  produk <span className="font-mono">{r.product_id?.slice(0, 8) ?? '—'}</span> ·
                  sesi <span className="font-mono">{r.session_id?.slice(0, 8) ?? '—'}</span> ·
                  draf <span className="font-mono">{r.article_draft_id?.slice(0, 8) ?? '—'}</span> ·
                  cover percobaan {r.cover_attempts}
                </p>
                {r.published_at ? (
                  <p className="mt-1 text-xs text-green-700">
                    Published {new Date(r.published_at).toLocaleString()} · {(r.article_ids ?? []).length} artikel
                  </p>
                ) : null}
                {r.error_message ? <p className="mt-1 text-xs text-red-700">{r.error_message}</p> : null}
              </div>
              <div className="flex gap-2">
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
        ))}
        {runRows.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Belum ada run. Aktifkan kill-switch lalu klik &quot;Run now&quot; untuk uji coba.
          </p>
        ) : null}
      </div>
    </div>
  );
}
