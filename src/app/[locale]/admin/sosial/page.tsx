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
  cancelSocialQueue,
  retrySocialQueue,
  toggleSocialAccount,
  updateSocialConfig
} from '@/lib/social/actions';

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    locale: 'id' as Locale,
    path: '/admin/sosial',
    title: 'Auto-Post Sosial',
    description: 'Konfigurasi antrean posting otomatis Threads',
    robots: { index: false, follow: false }
  });
}

interface ConfigRow {
  platform_slug: string;
  is_enabled: boolean;
  auto_queue_on_approve: boolean;
  default_lang: string;
  allow_lang_override: boolean;
  daily_cap: number;
  post_window_start: string;
  post_window_end: string;
  min_interval_minutes: number;
  account_id: string | null;
}

interface AccountRow {
  id: string;
  platform_slug: string;
  handle: string;
  threads_user_id: string | null;
  token_suffix: string | null;
  token_expires_at: string | null;
  status: string;
  priority: number;
  is_active: boolean;
}

interface QueueRow {
  id: string;
  draft_id: string;
  platform_slug: string;
  lang: string;
  scheduled_at: string;
  status: string;
  attempts: number;
  last_error: string | null;
  posted_url: string | null;
}

export default async function SocialAdminPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ oauth?: string; user?: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = (routing.locales.includes(rawLocale as Locale) ? rawLocale : routing.defaultLocale) as Locale;
  setRequestLocale(locale);
  if (!(await isAdmin())) redirect({ href: '/masuk', locale });
  const supabase = createSupabaseService();
  if (!supabase) throw new Error('Supabase not configured — set SUPABASE_SECRET_KEY');
  const query = await searchParams;

  const [{ data: configs }, { data: accounts }, { data: queue }] = await Promise.all([
    supabase.from('social_post_configs').select('*').order('platform_slug'),
    supabase.from('social_accounts').select('*').order('priority'),
    supabase
      .from('social_post_queue')
      .select('id, draft_id, platform_slug, lang, scheduled_at, status, attempts, last_error, posted_url')
      .order('scheduled_at', { ascending: false })
      .limit(20)
  ]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-4 text-sm">
        <Link href={{ pathname: '/admin' }} className="text-primary hover:underline">← Dasbor</Link>
      </div>
      <h1 className="text-2xl font-bold text-ink">Auto-Post Sosial</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Tahap awal: Threads <span className="font-mono">@asharu.id</span> (teks opener + replies, antrean terjadwal).
        Semua knob di tabel — perubahan di sini langsung dipakai worker tanpa deploy.
      </p>

      {query.oauth === 'ok' ? (
        <p role="status" className="mt-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
          OAuth berhasil — token tersimpan di Vault (user {query.user ?? '?'}). Aktifkan kill-switch di bawah bila siap posting.
        </p>
      ) : null}

      {(configs as ConfigRow[] | null ?? []).map((cfg) => (
        <form
          key={cfg.platform_slug}
          action={updateSocialConfig.bind(null, cfg.platform_slug)}
          className="mt-6 rounded-xl border border-line bg-surface p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-ink">Platform: {cfg.platform_slug}</p>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="is_enabled" defaultChecked={cfg.is_enabled} />
              Aktif (kill-switch)
            </label>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="auto_queue_on_approve" defaultChecked={cfg.auto_queue_on_approve} />
              Auto-queue saat approve
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="allow_lang_override" defaultChecked={cfg.allow_lang_override} />
              Bahasa bisa dipilih saat approve
            </label>
            <label className="text-sm text-ink">
              Bahasa default{' '}
              <select name="default_lang" defaultValue={cfg.default_lang} className="ml-1 rounded-lg border border-line bg-background px-2 py-1">
                <option value="id">Indonesia</option>
                <option value="en">Inggris</option>
              </select>
            </label>
            <label className="text-sm text-ink">
              Cap harian{' '}
              <input name="daily_cap" type="number" min={1} max={250} defaultValue={cfg.daily_cap} className="ml-1 w-20 rounded-lg border border-line bg-background px-2 py-1" />
            </label>
            <label className="text-sm text-ink">
              Window mulai{' '}
              <input name="post_window_start" defaultValue={cfg.post_window_start} pattern="\d{1,2}:\d{2}" className="ml-1 w-24 rounded-lg border border-line bg-background px-2 py-1" />
            </label>
            <label className="text-sm text-ink">
              Window selesai{' '}
              <input name="post_window_end" defaultValue={cfg.post_window_end} pattern="\d{1,2}:\d{2}" className="ml-1 w-24 rounded-lg border border-line bg-background px-2 py-1" />
            </label>
            <label className="text-sm text-ink">
              Interval (mnt){' '}
              <input name="min_interval_minutes" type="number" min={5} defaultValue={cfg.min_interval_minutes} className="ml-1 w-20 rounded-lg border border-line bg-background px-2 py-1" />
            </label>
          </div>
          <button type="submit" className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90">
            Simpan
          </button>
        </form>
      ))}

      <h2 className="mt-8 text-lg font-semibold text-ink">Akun</h2>
      <div className="mt-3 space-y-3">
        {(accounts as AccountRow[] | null ?? []).map((acc) => (
          <div key={acc.id} className="rounded-xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-ink">{acc.platform_slug} · {acc.handle}</p>
                <p className="text-xs text-ink-muted">
                  user {acc.threads_user_id ?? '—'} · token …{acc.token_suffix ?? '—'} ·
                  expires {acc.token_expires_at ? new Date(acc.token_expires_at).toLocaleDateString() : '—'} ·
                  {acc.status}
                </p>
              </div>
              <form action={toggleSocialAccount.bind(null, acc.id, !acc.is_active)}>
                <button
                  type="submit"
                  className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink hover:bg-background"
                >
                  {acc.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                </button>
              </form>
            </div>
          </div>
        ))}
      </div>

      <h2 className="mt-8 text-lg font-semibold text-ink">Antrean (20 terbaru)</h2>
      <div className="mt-3 space-y-3">
        {(queue as QueueRow[] | null ?? []).map((q) => (
          <div key={q.id} className="rounded-xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-mono text-xs text-ink-muted">{q.id.slice(0, 8)} · {q.status} · {q.lang} · percobaan {q.attempts}</p>
                <p className="text-sm text-ink">
                  Draf <span className="font-mono">{q.draft_id.slice(0, 8)}</span> · jadwal{' '}
                  {new Date(q.scheduled_at).toLocaleString()}
                </p>
                {q.last_error ? <p className="mt-1 text-xs text-red-700">{q.last_error}</p> : null}
                {q.posted_url ? (
                  <a href={q.posted_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-primary hover:underline">
                    Lihat postingan →
                  </a>
                ) : null}
              </div>
              <div className="flex gap-2">
                {q.status === 'failed' ? (
                  <form action={retrySocialQueue.bind(null, q.id)}>
                    <button type="submit" className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90">
                      Coba lagi
                    </button>
                  </form>
                ) : null}
                {q.status === 'queued' || q.status === 'posting' ? (
                  <form action={cancelSocialQueue.bind(null, q.id)}>
                    <button type="submit" className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink hover:bg-background">
                      Batalkan
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
          </div>
        ))}
        {(queue as QueueRow[] | null ?? []).length === 0 ? (
          <p className="text-sm text-ink-muted">Antrean kosong — approve draf untuk menjadwalkan posting.</p>
        ) : null}
      </div>
    </div>
  );
}
