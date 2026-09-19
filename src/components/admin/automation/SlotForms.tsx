'use client';

import { useState, useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';
import {
  createAutomationSlot,
  updateAutomationSlot,
  toggleAutomationSlot,
  deleteAutomationSlot,
  runAutomationNow,
  type AutomationActionResult
} from '@/lib/automation/actions';
import { ActionNoticeView, PendingButton, type ActionNotice } from '../llm/ActionFeedback';

// --- Helpers ----------------------------------------------------------------

function toNotice(
  result: AutomationActionResult,
  okMessage: string,
  failTitle = 'Gagal menyimpan.'
): ActionNotice {
  if (result.ok) return { type: 'success', message: result.message ?? okMessage };
  return { type: 'error', message: failTitle, detail: result.error };
}

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

const inputCls = 'mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-ink';
const labelCls = 'block text-sm text-ink';

/** Bitmask Senin–Minggu → label可读. */
export function weekdaysLabel(bits: number): string {
  if (bits === 127) return 'setiap hari';
  if (bits === 31) return 'Senin–Jumat';
  if (bits === 96) return 'Sabtu–Minggu';
  const days: string[] = [];
  if (bits & 1) days.push('Sen');
  if (bits & 2) days.push('Sel');
  if (bits & 4) days.push('Rab');
  if (bits & 8) days.push('Kam');
  if (bits & 16) days.push('Jum');
  if (bits & 32) days.push('Sab');
  if (bits & 64) days.push('Min');
  return days.join(',') || '?';
}

// --- Types ------------------------------------------------------------------

export interface SlotRowData {
  slot_key: string;
  label: string;
  hour: number;
  minute: number;
  weekdays: number;
  is_enabled: boolean;
  window_minutes: number | null;
  priority: number;
  platform_slugs: string[] | null;
  max_topics: number | null;
  product_pool_size: number | null;
  product_category: string | null;
  auto_publish_article: boolean | null;
  require_cover: boolean | null;
  notify_on: string | null;
  notify_emails: string[] | null;
  maximum_iterations: number | null;
  minimum_score: number | null;
  minimum_candidates: number | null;
  freshness_hours: number | null;
  cover_max_wait_minutes: number | null;
  cover_max_attempts: number | null;
  max_retry_attempts: number | null;
  language: string | null;
  tone: string | null;
  audience: string | null;
  purpose: string | null;
  cta_style: string | null;
  target_reply_count: number | null;
  template_slug: string | null;
  idea_generation_enabled: boolean | null;
  idea_product_search: boolean | null;
  email_from: string | null;
  email_reply_to: string | null;
  updated_at: string;
}

export interface GlobalDefaults {
  max_topics: number | null;
  product_pool_size: number | null;
  language: string | null;
  tone: string | null;
  audience: string | null;
  purpose: string | null;
  cta_style: string | null;
  target_reply_count: number | null;
  template_slug: string | null;
  maximum_iterations: number | null;
  minimum_score: number | null;
  minimum_candidates: number | null;
  freshness_hours: number | null;
  cover_max_wait_minutes: number | null;
  cover_max_attempts: number | null;
  max_retry_attempts: number | null;
  notify_on: string | null;
  notify_emails: string[] | null;
  idea_generation_enabled: boolean | null;
  idea_product_search: boolean | null;
  require_cover: boolean | null;
  auto_publish_article: boolean | null;
  email_from: string | null;
  email_reply_to: string | null;
  product_category: string | null;
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

// --- SlotCreateForm ---------------------------------------------------------

export function SlotCreateForm({
  platformRows
}: {
  platformRows: PlatformRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { notice, run } = useNotice();
  async function handleCreate(fd: FormData): Promise<void> {
    const ok = await run(
      () => createAutomationSlot(fd),
      'Slot dibuat.',
      'Membuat...',
      'Gagal membuat slot.'
    );
    if (ok) startTransition(() => router.refresh());
  }
  return (
    <div>
      <form action={handleCreate} className="rounded-xl border border-line bg-surface p-4">
        <p className="text-sm font-semibold text-ink">Tambah slot baru</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className={labelCls}>
            Slot key (identitas, huruf kecil/angka/hyphen, maks 32)
            <input
              type="text"
              name="slot_key"
              pattern="[a-z0-9-]{1,32}"
              title="Huruf kecil a–z, angka 0–9, dan hyphen (-). Maksimal 32 karakter. Tidak bisa diubah setelah dibuat."
              placeholder="mis. pagi, siang, malam"
              className={inputCls}
            />
          </label>
          <label className={labelCls}>
            Label tampilan
            <input name="label" placeholder="(opsional, default = slot_key)" className={inputCls} />
          </label>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className={labelCls}>
            Jam (0–23)
            <input type="number" min={0} max={23} name="hour" defaultValue={10} className={inputCls} />
          </label>
          <label className={labelCls}>
            Menit (0–59)
            <input type="number" min={0} max={59} name="minute" defaultValue={0} className={inputCls} />
          </label>
          <label className={labelCls}>
            Weekdays bitmask (0–127)
            <input
              type="number"
              min={0}
              max={127}
              name="weekdays"
              defaultValue={127}
              className={inputCls}
            />
            <span className="mt-1 block text-xs text-ink-muted">
              127 setiap hari · 31 Senin–Jumat · 96 Sabtu–Minggu
            </span>
          </label>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className={labelCls}>
            Window (menit, kosong = warisi global 60)
            <input
              type="number"
              min={5}
              max={720}
              name="window_minutes"
              placeholder="60"
              className={inputCls}
            />
          </label>
          <label className={labelCls}>
            Priority (urutkan slot)
            <input type="number" name="priority" defaultValue={0} className={inputCls} />
          </label>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <input type="checkbox" name="is_enabled" id="create_is_enabled" defaultChecked />
          <label htmlFor="create_is_enabled" className={labelCls}>
            Aktifkan slot
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <PendingButton
            label="Buat slot"
            pendingLabel="Membuat..."
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
        {notice ? (
          <div className="mt-3">
            <ActionNoticeView notice={notice} />
          </div>
        ) : null}
      </form>
    </div>
  );
}

// --- SlotCard ---------------------------------------------------------------

export function SlotCard({
  slot,
  platforms,
  templates,
  globalDefaults
}: {
  slot: SlotRowData;
  platforms: PlatformRow[];
  templates: TemplateRow[];
  globalDefaults: GlobalDefaults;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { notice: saveNotice, run: runSave } = useNotice();
  const { notice: actNotice, run: runAct } = useNotice();

  async function handleUpdate(fd: FormData): Promise<void> {
    const ok = await runSave(
      () => updateAutomationSlot(fd),
      'Slot diperbarui.',
      'Menyimpan...',
      'Gagal memperbarui.'
    );
    if (ok) startTransition(() => router.refresh());
  }
  async function handleToggle(): Promise<void> {
    await runAct(
      () => toggleAutomationSlot(slot.slot_key),
      `Slot ${slot.slot_key} diaktifkan.`,
      'Mengubah status...',
      'Gagal mengubah status.'
    );
    startTransition(() => router.refresh());
  }
  async function handleDelete(): Promise<void> {
    if (!window.confirm(`Hapus slot "${slot.label ?? slot.slot_key}"? Tindakan ini tidak bisa dibatalkan.`)) return;
    const ok = await runAct(
      () => deleteAutomationSlot(slot.slot_key),
      `Slot ${slot.slot_key} dihapus.`,
      'Menghapus...',
      'Gagal menghapus slot.'
    );
    if (ok) startTransition(() => router.refresh());
  }
  async function handleRun(): Promise<void> {
    await runAct(
      () => runAutomationNow(slot.slot_key),
      'Tick slot dijalankan.',
      'Menjalankan tick slot...',
      'Gagal menjalankan tick.'
    );
    startTransition(() => router.refresh());
  }

  function triStateValue(val: boolean | null): string {
    if (val === true) return 'true';
    if (val === false) return 'false';
    return '';
  }

  function globalPlaceholder(key: keyof GlobalDefaults): string {
    const v = globalDefaults[key];
    if (v === null || v === undefined) return 'Warisi global (—)';
    if (Array.isArray(v)) return `Warisi global (${v.join(', ')})`;
    return `Warisi global (${String(v)})`;
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      {/* Summary row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">
            {slot.label || slot.slot_key}
            <span className="ml-2 font-mono text-xs text-ink-muted">{slot.slot_key}</span>
          </p>
          <p className="text-xs text-ink-muted">
            {String(slot.hour).padStart(2, '0')}:{String(slot.minute).padStart(2, '0')} ·{' '}
            {weekdaysLabel(slot.weekdays)}
            {slot.window_minutes ? ` · ${slot.window_minutes} mnt` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs ${slot.is_enabled ? 'text-green-700' : 'text-ink-muted'}`}>
            {slot.is_enabled ? '● aktif' : '○ nonaktif'}
          </span>
          <button
            type="button"
            onClick={() => { void handleRun(); }}
            disabled={isPending}
            aria-busy={isPending}
            className="rounded-lg border border-line px-2 py-1 text-xs text-ink hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
            title="Jalankan tick slot ini sekarang"
          >
            Run
          </button>
          <button
            type="button"
            onClick={() => { void handleToggle(); }}
            disabled={isPending}
            aria-busy={isPending}
            className="rounded-lg border border-line px-2 py-1 text-xs text-ink hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
            title={slot.is_enabled ? 'Nonaktifkan slot' : 'Aktifkan slot'}
          >
            {slot.is_enabled ? 'Nonaktif' : 'Aktif'}
          </button>
          {slot.slot_key !== 'default' ? (
            <button
              type="button"
              onClick={() => { void handleDelete(); }}
              disabled={isPending}
              aria-busy={isPending}
              className="rounded-lg border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              title="Hapus slot"
            >
              Hapus
            </button>
          ) : null}
        </div>
      </div>

      {actNotice ? (
        <div className="mt-2">
          <ActionNoticeView notice={actNotice} />
        </div>
      ) : null}

      {/* Edit + override (collapsible) */}
      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Edit & override
        </summary>
        <form action={handleUpdate} className="mt-3 space-y-5">
          <input type="hidden" name="slot_key" value={slot.slot_key} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelCls}>
              Slot key (readonly)
              <input type="text" value={slot.slot_key} readOnly className={`${inputCls} cursor-not-allowed opacity-70`} />
            </label>
            <label className={labelCls}>
              Label tampilan
              <input name="label" defaultValue={slot.label ?? ''} className={inputCls} />
            </label>
          </div>

          {/* Schedule */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Jadwal</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              <label className={labelCls}>
                Jam (0–23)
                <input type="number" min={0} max={23} name="hour" defaultValue={slot.hour} className={inputCls} />
              </label>
              <label className={labelCls}>
                Menit (0–59)
                <input type="number" min={0} max={59} name="minute" defaultValue={slot.minute} className={inputCls} />
              </label>
              <label className={labelCls}>
                Weekdays bitmask (0–127)
                <input
                  type="number"
                  min={0}
                  max={127}
                  name="weekdays"
                  defaultValue={slot.weekdays}
                  className={inputCls}
                />
                <span className="mt-1 block text-xs text-ink-muted">
                  {weekdaysLabel(slot.weekdays)} · 127 setiap hari
                </span>
              </label>
            </div>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <label className={labelCls}>
                Window (menit, kosong = warisi global)
                <input
                  type="number"
                  min={5}
                  max={720}
                  name="window_minutes"
                  defaultValue={slot.window_minutes ?? ''}
                  placeholder={globalPlaceholder('cover_max_wait_minutes').replace('Warisi global ', '') || '60'}
                  className={inputCls}
                />
              </label>
              <label className={labelCls}>
                Priority
                <input type="number" name="priority" defaultValue={slot.priority} className={inputCls} />
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" name="is_enabled" defaultChecked={slot.is_enabled} />
                Aktifkan slot
              </label>
            </div>
          </div>

          {/* Discovery */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Discovery (riset)</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <label className={labelCls}>
                Maks iterasi
                <input
                  type="number"
                  min={1}
                  max={5}
                  name="maximum_iterations"
                  defaultValue={slot.maximum_iterations ?? ''}
                  placeholder={globalPlaceholder('maximum_iterations')}
                  className={inputCls}
                />
              </label>
              <label className={labelCls}>
                Minimum score (0–100)
                <input
                  type="number"
                  min={0}
                  max={100}
                  name="minimum_score"
                  defaultValue={slot.minimum_score ?? ''}
                  placeholder={globalPlaceholder('minimum_score')}
                  className={inputCls}
                />
              </label>
              <label className={labelCls}>
                Minimum kandidat
                <input
                  type="number"
                  min={1}
                  max={50}
                  name="minimum_candidates"
                  defaultValue={slot.minimum_candidates ?? ''}
                  placeholder={globalPlaceholder('minimum_candidates')}
                  className={inputCls}
                />
              </label>
              <label className={labelCls}>
                Freshness jam (1–720)
                <input
                  type="number"
                  min={1}
                  max={720}
                  name="freshness_hours"
                  defaultValue={slot.freshness_hours ?? ''}
                  placeholder={globalPlaceholder('freshness_hours')}
                  className={inputCls}
                />
              </label>
            </div>
          </div>

          {/* Cover & retry */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Cover & retry</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              <label className={labelCls}>
                Batas tunggu cover (mnt)
                <input
                  type="number"
                  min={5}
                  max={720}
                  name="cover_max_wait_minutes"
                  defaultValue={slot.cover_max_wait_minutes ?? ''}
                  placeholder={globalPlaceholder('cover_max_wait_minutes')}
                  className={inputCls}
                />
              </label>
              <label className={labelCls}>
                Maks percobaan cover
                <input
                  type="number"
                  min={1}
                  max={10}
                  name="cover_max_attempts"
                  defaultValue={slot.cover_max_attempts ?? ''}
                  placeholder={globalPlaceholder('cover_max_attempts')}
                  className={inputCls}
                />
              </label>
              <label className={labelCls}>
                Maks retry/hari
                <input
                  type="number"
                  min={0}
                  max={10}
                  name="max_retry_attempts"
                  defaultValue={slot.max_retry_attempts ?? ''}
                  placeholder={globalPlaceholder('max_retry_attempts')}
                  className={inputCls}
                />
              </label>
            </div>
          </div>

          {/* Platform & produk */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Platform & produk</p>
            <fieldset className="mt-2 flex flex-wrap gap-3">
              {platforms.map((p) => (
                <label key={p.slug} className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    name="platform_slugs"
                    value={p.slug}
                    defaultChecked={slot.platform_slugs?.includes(p.slug) ?? false}
                  />
                  {p.display_name} <span className="font-mono text-xs text-ink-muted">({p.slug})</span>
                </label>
              ))}
            </fieldset>
            <p className="mt-1 text-xs text-ink-muted">Kosongkan semua = warisi global</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <label className={labelCls}>
                Pool produk terbaru (N)
                <input
                  type="number"
                  min={1}
                  max={500}
                  name="product_pool_size"
                  defaultValue={slot.product_pool_size ?? ''}
                  placeholder={globalPlaceholder('product_pool_size')}
                  className={inputCls}
                />
              </label>
              <label className={labelCls}>
                Filter kategori (opsional)
                <input
                  name="product_category"
                  defaultValue={slot.product_category ?? ''}
                  placeholder={globalPlaceholder('product_category')}
                  className={inputCls}
                />
              </label>
              <label className={labelCls}>
                Template riset
                <select name="template_slug" defaultValue={slot.template_slug ?? ''} className={inputCls}>
                  <option value="">Warisi global ({globalDefaults.template_slug ?? '—'})</option>
                  <option value="_bebas">Bebas (tidak pakai template)</option>
                  {templates.map((t) => (
                    <option key={t.slug} value={t.slug}>{t.display_name}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {/* Gaya konten */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Gaya konten</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              <label className={labelCls}>
                Bahasa
                <select name="language" defaultValue={slot.language ?? ''} className={inputCls}>
                  <option value="">Warisi global ({globalDefaults.language ?? '—'})</option>
                  {LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
              </label>
              <label className={labelCls}>
                Tone
                <select name="tone" defaultValue={slot.tone ?? ''} className={inputCls}>
                  <option value="">Warisi global ({globalDefaults.tone ?? '—'})</option>
                  {TONES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label className={labelCls}>
                CTA style
                <input
                  name="cta_style"
                  defaultValue={slot.cta_style ?? ''}
                  placeholder={globalPlaceholder('cta_style')}
                  className={inputCls}
                />
              </label>
              <label className={labelCls}>
                Audience
                <input
                  name="audience"
                  defaultValue={slot.audience ?? ''}
                  placeholder={globalPlaceholder('audience')}
                  className={inputCls}
                />
              </label>
              <label className={labelCls}>
                Purpose
                <input
                  name="purpose"
                  defaultValue={slot.purpose ?? ''}
                  placeholder={globalPlaceholder('purpose')}
                  className={inputCls}
                />
              </label>
              <label className={labelCls}>
                Target reply count (1–10)
                <input
                  type="number"
                  min={1}
                  max={10}
                  name="target_reply_count"
                  defaultValue={slot.target_reply_count ?? ''}
                  placeholder={globalPlaceholder('target_reply_count')}
                  className={inputCls}
                />
              </label>
            </div>
          </div>

          {/* Notifikasi */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Notifikasi</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <label className={labelCls}>
                Kirim email
                <select name="notify_on" defaultValue={slot.notify_on ?? ''} className={inputCls}>
                  <option value="">Warisi global ({globalDefaults.notify_on ?? '—'})</option>
                  {NOTIFY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label className={labelCls}>
                Penerima (pisah koma, kosong = semua admin)
                <input
                  name="notify_emails"
                  defaultValue={slot.notify_emails?.join(', ') ?? ''}
                  placeholder={globalPlaceholder('notify_emails')}
                  className={inputCls}
                />
              </label>
              <label className={labelCls}>
                From
                <input
                  name="email_from"
                  defaultValue={slot.email_from ?? ''}
                  placeholder={globalPlaceholder('email_from')}
                  className={inputCls}
                />
              </label>
              <label className={labelCls}>
                Reply-to (opsional)
                <input
                  name="email_reply_to"
                  defaultValue={slot.email_reply_to ?? ''}
                  placeholder={globalPlaceholder('email_reply_to')}
                  className={inputCls}
                />
              </label>
            </div>
          </div>

          {/* Ideation + publish */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Ideation & Publish</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              <label className={labelCls}>
                Auto publish artikel
                <select name="auto_publish_article" defaultValue={triStateValue(slot.auto_publish_article)} className={inputCls}>
                  <option value="">Warisi global</option>
                  <option value="true">Ya</option>
                  <option value="false">Tidak</option>
                </select>
              </label>
              <label className={labelCls}>
                Wajib cover
                <select name="require_cover" defaultValue={triStateValue(slot.require_cover)} className={inputCls}>
                  <option value="">Warisi global</option>
                  <option value="true">Ya</option>
                  <option value="false">Tidak</option>
                </select>
              </label>
              <label className={labelCls}>
                Generate ide
                <select name="idea_generation_enabled" defaultValue={triStateValue(slot.idea_generation_enabled)} className={inputCls}>
                  <option value="">Warisi global</option>
                  <option value="true">Ya</option>
                  <option value="false">Tidak</option>
                </select>
              </label>
              <label className={labelCls}>
                Riset mekanisme produk
                <select name="idea_product_search" defaultValue={triStateValue(slot.idea_product_search)} className={inputCls}>
                  <option value="">Warisi global</option>
                  <option value="true">Ya</option>
                  <option value="false">Tidak</option>
                </select>
              </label>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <PendingButton
              label="Simpan perubahan"
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
      </details>
    </div>
  );
}

// --- SlotSection ------------------------------------------------------------

export function SlotSection({
  slots,
  platforms,
  templates,
  globalDefaults
}: {
  slots: SlotRowData[];
  platforms: PlatformRow[];
  templates: TemplateRow[];
  globalDefaults: GlobalDefaults;
}) {
  return (
    <div>
      <h2 className="mt-8 text-lg font-semibold text-ink">Slot jadwal</h2>
      <p className="mt-1 text-xs text-ink-muted">
        N slot per hari, masing-masing jam + hari aktif (bitmask Senin–Minggu) + on/off.
        Maks 4 slot aktif; window default 60 mnt. Slot <code>default</code> dibuat otomatis dari konfigurasi lama.
      </p>
      <div className="mt-4 space-y-3">
        <SlotCreateForm platformRows={platforms} />
        {slots.length === 0 ? (
          <p className="py-3 text-sm text-ink-muted">
            Belum ada slot — migrasi <code>20260920000002</code> belum dijalankan.
          </p>
        ) : (
          slots.map((s) => (
            <SlotCard
              key={s.slot_key}
              slot={s}
              platforms={platforms}
              templates={templates}
              globalDefaults={globalDefaults}
            />
          ))
        )}
      </div>
    </div>
  );
}
