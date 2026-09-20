'use client';

import { useState, useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';
import {
  retryAutomationRun,
  runAutomationNow,
  updateAutomationConfig,
  sendAutomationTestEmail,
  type AutomationActionResult
} from '@/lib/automation/actions';
import {
  ActionNoticeView,
  PendingButton,
  type ActionNotice
} from '../llm/ActionFeedback';

function toNotice(
  result: AutomationActionResult,
  okMessage: string,
  failTitle = 'Gagal menyimpan.'
): ActionNotice {
  if (result.ok) return { type: 'success', message: result.message ?? okMessage };
  return { type: 'error', message: failTitle, detail: result.error };
}

/** Hook notice lokal (pola `useActionForm` di `LlmForms.tsx`). */
function useNotice() {
  const [notice, setNotice] = useState<ActionNotice | null>(null);
  async function run(
    fn: () => Promise<AutomationActionResult>,
    okMessage: string,
    workingMessage: string,
    failTitle?: string
  ): Promise<boolean> {
    setNotice({ type: 'working', message: workingMessage });
    try {
      const r = await fn();
      setNotice(toNotice(r, okMessage, failTitle));
      return r.ok;
    } catch (e) {
      setNotice({
        type: 'error',
        message: failTitle ?? 'Gagal menyimpan.',
        detail: e instanceof Error ? e.message : String(e)
      });
      return false;
    }
  }
  return { notice, run };
}

export interface ConfigFormData {
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
}

interface PlatformRow {
  slug: string;
  display_name: string;
}

interface TemplateRow {
  slug: string;
  display_name: string;
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

/** Format `Name <email@domain>` — longgar: butuh `<`, `>`, dan minimal 1 titik di domain. */
function isValidEmailFrom(value: string): boolean {
  if (!value) return false;
  const m = value.match(/^(.+?)\s*<([^>@]+)@([^>@]+\.[^>@]+)>$/);
  return m !== null;
}

/** Cek apakah domain pengirim berubah dari nilai awal (perlu verifikasi DNS). */
function extractDomain(value: string): string | null {
  const m = value.match(/<([^>@]+)@([^>@]+)>$/);
  return m ? (m[2] as string) : null;
}

/**
 * Form konfigurasi automation + tombol Run now, dengan feedback inline
 * (pending → sukses/error) mengikuti pola form admin LLM/Visual.
 */
export function AutomationConfigForm({
  cfg,
  platformRows,
  templateRows
}: {
  cfg: ConfigFormData;
  platformRows: PlatformRow[];
  templateRows: TemplateRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { notice: saveNotice, run: runSave } = useNotice();
  const { notice: runNotice, run: runTick } = useNotice();
  const { notice: testNotice, run: runTest } = useNotice();
  async function handleSave(fd: FormData): Promise<void> {
    const ok = await runSave(
      () => updateAutomationConfig(fd),
      'Konfigurasi tersimpan.',
      'Menyimpan...'
    );
    if (ok) startTransition(() => router.refresh());
  }
  async function handleRunNow(): Promise<void> {
    await runTick(() => runAutomationNow(), 'Tick dijalankan.', 'Menjalankan...', 'Gagal menjalankan.');
    startTransition(() => router.refresh());
  }
  async function handleTestEmail(): Promise<void> {
    await runTest(() => sendAutomationTestEmail(), 'Email test terkirim.', 'Mengirim email test...', 'Gagal mengirim email test.');
  }
  return (
    <div>
      <form action={handleSave} className="mt-6 rounded-xl border border-line bg-surface p-4">
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

        <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-ink-muted">Generate ide (ideation)</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2">
            <input type="checkbox" name="idea_generation_enabled" defaultChecked={cfg.idea_generation_enabled} />
            Generate ide dari mekanisme produk sebelum riset (disarankan)
          </label>
          <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2">
            <input type="checkbox" name="idea_product_search" defaultChecked={cfg.idea_product_search} />
            Riset mekanisme via Tavily (mati = LLM-only dari nama produk, hemat kuota)
          </label>
          <p className="text-xs text-ink-muted sm:col-span-2">
            Alur: riset mekanisme produk → LLM susun ide (topik, keywords, kategori, audience) → discovery memakai
            parameter yang diperkaya. Gagal di tahap ini tidak menggagalkan run (lanjut parameter config mentah).
          </p>
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
            {(() => {
              const valid = isValidEmailFrom(cfg.email_from);
              const domain = extractDomain(cfg.email_from);
              const defaultDomain = extractDomain('Asharu <updates@alamaby.com>');
              if (!valid) {
                return (
                  <p className="mt-1 text-xs text-amber-700">
                    Format wajib &quot;Nama &lt;email@domain&gt;&quot; — simpan tetap lolos tapi Resend akan tolak bila format salah.
                  </p>
                );
              }
              if (domain && domain !== defaultDomain) {
                return (
                  <p className="mt-1 text-xs text-amber-700">
                    Domain baru ({domain}) — pastikan sudah terverifikasi di Resend Domains sebelum mengirim email.
                  </p>
                );
              }
              return null;
            })()}
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
          <PendingButton
            label="Simpan"
            pendingLabel="Menyimpan..."
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
        {saveNotice ? (
          <div className="mt-3">
            <ActionNoticeView notice={saveNotice} />
          </div>
        ) : null}
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            void handleRunNow();
          }}
          disabled={isPending}
          aria-busy={isPending}
          className="rounded-lg border border-line px-4 py-2 text-sm text-ink hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
          title="Jalankan satu tick sekarang (mengabaikan jendela jadwal)"
        >
          Run now
        </button>
        <button
          type="button"
          onClick={() => {
            void handleTestEmail();
          }}
          disabled={isPending}
          aria-busy={isPending}
          className="rounded-lg border border-line px-4 py-2 text-sm text-ink hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
          title="Kirim 1 email probe ke penerima config untuk diagnosa Resend"
        >
          Kirim email test
        </button>
        {runNotice ? (
          <div className="mt-3">
            <ActionNoticeView notice={runNotice} />
          </div>
        ) : null}
        {testNotice ? (
          <div className="mt-3">
            <ActionNoticeView notice={testNotice} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Tombol "Coba lagi" untuk 1 baris run yang failed, dengan notice inline
 * (menggantikan form polos tanpa feedback).
 */
export function RetryRunForm({ runId }: { runId: string }) {
  const { notice, run } = useNotice();
  if (notice) {
    return (
      <div className="max-w-[240px]">
        <ActionNoticeView notice={notice} />
      </div>
    );
  }
  async function handleRetry(): Promise<void> {
    await run(() => retryAutomationRun(runId), 'Run direset.', 'Menyiapkan ulang...', 'Gagal mengulang.');
  }
  return (
    <button
      type="button"
      onClick={() => {
        void handleRetry();
      }}
      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      Coba lagi
    </button>
  );
}
