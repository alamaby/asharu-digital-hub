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
  retryAutomationRun,
  runAutomationNow,
  updateAutomationConfig
} from '@/lib/automation/actions';

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

const TONES = ['casual', 'formal', 'witty', 'professional', 'friendly', 'edukatif'];
const LANGUAGES = [
  { value: 'both', label: 'Indonesia + Inggris' },
  { value: 'id', label: 'Indonesia' },
  { value: 'en', label: 'Inggris' }
];
const NOTIFY_OPTIONS = [
  { value: 'both', label: 'Draft siap + Published' },
  { value: 'draft_ready', label: 'Hanya draft siap' },
  { value: 'published', label: 'Hanya published' },
  { value: 'none', label: 'Tidak ada email' }
];

const inputCls = 'mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-ink';
const labelCls = 'block text-sm text-ink';

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
        <form action={updateAutomationConfig} className="mt-6 rounded-xl border border-line bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-ink">Konfigurasi</p>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="is_enabled" defaultChecked={cfg.is_enabled} />
              Aktif (kill-switch)
            </label>
          </div>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-muted">Jadwal</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            <label className={labelCls}>
              Jam (0–23)
              <input type="number" min={0} max={23} name="schedule_hour" defaultValue={cfg.schedule_hour} className={inputCls} />
            </label>
            <label className={labelCls}>
              Menit (0–59)
              <input type="number" min={0} max={59} name="schedule_minute" defaultValue={cfg.schedule_minute} className={inputCls} />
            </label>
            <label className={labelCls}>
              Timezone
              <input name="timezone" defaultValue={cfg.timezone} className={inputCls} />
            </label>
            <label className={labelCls}>
              Jendela (menit)
              <input type="number" min={5} max={1440} name="schedule_window_minutes" defaultValue={cfg.schedule_window_minutes} className={inputCls} />
            </label>
            <label className={labelCls}>
              Retry maks/hari
              <input type="number" min={0} max={10} name="max_retry_attempts" defaultValue={cfg.max_retry_attempts} className={inputCls} />
            </label>
            <p className="self-end text-xs text-ink-muted">
              Terakhir run: {cfg.last_run_at ? new Date(cfg.last_run_at).toLocaleString() : '—'}
            </p>
          </div>

          <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-ink-muted">Platform & topik</p>
          <fieldset className="mt-2 flex flex-wrap gap-3">
            {platformRows.map((p) => (
              <label key={p.slug} className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  name="platform_slugs"
                  value={p.slug}
                  defaultChecked={cfg.platform_slugs.includes(p.slug)}
                />
                {p.display_name} <span className="font-mono text-xs text-ink-muted">({p.slug})</span>
              </label>
            ))}
          </fieldset>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className={labelCls}>
              Maks topik
              <input type="number" min={1} max={10} name="max_topics" defaultValue={cfg.max_topics} className={inputCls} />
            </label>
            <label className={labelCls}>
              Template riset
              <select name="template_slug" defaultValue={cfg.template_slug ?? ''} className={inputCls}>
                <option value="">Bebas</option>
                {templateRows.map((t) => (
                  <option key={t.slug} value={t.slug}>{t.display_name}</option>
                ))}
              </select>
            </label>
          </div>

          <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-ink-muted">Pemilihan produk</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <label className={labelCls}>
              Pool produk terbaru (N)
              <input type="number" min={1} max={500} name="product_pool_size" defaultValue={cfg.product_pool_size} className={inputCls} />
            </label>
            <label className={labelCls}>
              Filter kategori (opsional)
              <input name="product_category" defaultValue={cfg.product_category ?? ''} placeholder="electronics" className={inputCls} />
            </label>
          </div>

          <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-ink-muted">Gaya konten</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            <label className={labelCls}>
              Bahasa
              <select name="language" defaultValue={cfg.language} className={inputCls}>
                {LANGUAGES.map((l) => (<option key={l.value} value={l.value}>{l.label}</option>))}
              </select>
            </label>
            <label className={labelCls}>
              Tone
              <select name="tone" defaultValue={cfg.tone} className={inputCls}>
                {TONES.map((t) => (<option key={t} value={t}>{t}</option>))}
              </select>
            </label>
            <label className={labelCls}>
              CTA style
              <input name="cta_style" defaultValue={cfg.cta_style} className={inputCls} />
            </label>
            <label className={labelCls}>
              Audience
              <input name="audience" defaultValue={cfg.audience} className={inputCls} />
            </label>
            <label className={labelCls}>
              Purpose
              <input name="purpose" defaultValue={cfg.purpose} className={inputCls} />
            </label>
            <label className={labelCls}>
              Reply count (opsional)
              <input type="number" min={1} max={10} name="target_reply_count" defaultValue={cfg.target_reply_count ?? ''} className={inputCls} />
            </label>
          </div>

          <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-ink-muted">Cover & publish</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            <label className="flex items-center gap-2 text-sm text-ink sm:col-span-3">
              <input type="checkbox" name="require_cover" defaultChecked={cfg.require_cover} />
              Wajib cover ter-render sebelum publish
            </label>
            <label className="flex items-center gap-2 text-sm text-ink sm:col-span-3">
              <input type="checkbox" name="auto_publish_article" defaultChecked={cfg.auto_publish_article} />
              Auto-publish artikel (tanpa review admin)
            </label>
            <label className={labelCls}>
              Batas tunggu cover (menit)
              <input type="number" min={5} max={720} name="cover_max_wait_minutes" defaultValue={cfg.cover_max_wait_minutes} className={inputCls} />
            </label>
            <label className={labelCls}>
              Maks percobaan cover
              <input type="number" min={1} max={10} name="cover_max_attempts" defaultValue={cfg.cover_max_attempts} className={inputCls} />
            </label>
          </div>

          <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-ink-muted">Email (Resend)</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <label className={labelCls}>
              Kirim email
              <select name="notify_on" defaultValue={cfg.notify_on} className={inputCls}>
                {NOTIFY_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
              </select>
            </label>
            <label className={labelCls}>
              From
              <input name="email_from" defaultValue={cfg.email_from} className={inputCls} />
            </label>
            <label className={labelCls}>
              Reply-to (opsional)
              <input name="email_reply_to" defaultValue={cfg.email_reply_to ?? ''} className={inputCls} />
            </label>
            <label className={labelCls}>
              Penerima (pisah koma; kosong = semua admin)
              <input name="notify_emails" defaultValue={cfg.notify_emails.join(', ')} className={inputCls} />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90">
              Simpan
            </button>
          </div>
        </form>
      )}

      {cfg ? (
        <form action={runAutomationNow} className="mt-4">
          <button
            type="submit"
            className="rounded-lg border border-line px-4 py-2 text-sm text-ink hover:bg-background"
            title="Jalankan satu tick sekarang (mengabaikan jendela jadwal)"
          >
            Run now
          </button>
        </form>
      ) : null}

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
                  <form action={retryAutomationRun.bind(null, r.id)}>
                    <button type="submit" className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90">
                      Coba lagi
                    </button>
                  </form>
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
