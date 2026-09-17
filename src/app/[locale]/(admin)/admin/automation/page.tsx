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

  const [{ data: config }, { data: runs }, { data: platforms }, { data: templates }] =
    await Promise.all([
      supabase.from('automation_configs').select('*').eq('id', 1).maybeSingle(),
      supabase
        .from('automation_runs')
        .select(
          'id, run_date, status, product_id, session_id, article_draft_id, article_ids, cover_attempts, attempts, error_message, published_at, updated_at'
        )
        .order('run_date', { ascending: false })
        .limit(20),
      supabase.from('platforms').select('slug, display_name').eq('is_active', true).neq('slug', 'all').order('slug'),
      supabase.from('research_templates').select('slug, display_name').eq('is_active', true).order('sort_order')
    ]);

  const cfg = config as ConfigRow | null;
  const runRows = (runs as RunRow[] | null) ?? [];
  const platformRows = (platforms as { slug: string; display_name: string }[] | null) ?? [];
  const templateRows = (templates as { slug: string; display_name: string }[] | null) ?? [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-4 text-sm">
        <Link href={{ pathname: '/admin' }} className="text-primary hover:underline">← Dasbor</Link>
      </div>
      <h1 className="text-2xl font-bold text-ink">Automation Riset Harian</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Cron tiap 5 menit, gated ke jam lokal di bawah, maksimal 1 run/hari. Alur: pilih acak 1 produk →
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
      
      <h2 className="mt-8 text-lg font-semibold text-ink">Riwayat run (20 terbaru)</h2>
      <div className="mt-3 space-y-3">
        {runRows.map((r) => (
          <div key={r.id} className="rounded-xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">
                  {r.run_date} · <span className="font-mono text-xs">{r.status}</span>
                  {r.attempts > 0 ? <span className="ml-2 text-xs text-ink-muted">retry {r.attempts}</span> : null}
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
