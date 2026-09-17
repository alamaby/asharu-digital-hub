'use server';

import { revalidatePath } from 'next/cache';
import { isAdmin } from '@/lib/auth/is-admin';
import { createSupabaseService } from '@/lib/supabase/server';
import { runAutomationTick, type AutomationTickResult } from '@/lib/automation/runner';

/** Hasil aksi admin (pola `LlmActionResult`) — dipakai komponen client untuk notice. */
export interface AutomationActionResult {
  ok: boolean;
  /** Pesan sukses yang ramah untuk admin. */
  message?: string;
  /** Pesan error asli (bukan digest generik Next.js). */
  error?: string;
}

function automationOk(message?: string): AutomationActionResult {
  return { ok: true, message };
}

function automationFail(error: unknown): AutomationActionResult {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

async function requireAdmin() {
  if (!(await isAdmin())) throw new Error('Unauthorized: admin only');
  const supabase = createSupabaseService();
  if (!supabase) throw new Error('Supabase not configured');
  return supabase;
}

function bool(form: FormData, key: string): boolean {
  return form.get(key) === 'on' || form.get(key) === 'true';
}

function num(form: FormData, key: string, fallback: number): number {
  const raw = form.get(key);
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function str(form: FormData, key: string): string | null {
  const raw = form.get(key);
  if (raw == null) return null;
  const v = String(raw).trim();
  return v === '' ? null : v;
}

/**
 * Baca daftar multi-nilai dari FormData (`getAll`): menangani checkbox group
 * `name` sama (mis. `platform_slugs`) SEKALIGUS textarea/input dipisah koma.
 * `form.get()` hanya mengembalikan nilai pertama — sebab root bug platform
 * hanya `artikel` yang tersimpan (16 Sep 2026).
 */
function listValues(form: FormData, key: string): string[] {
  return form
    .getAll(key)
    .flatMap((raw) => String(raw).split(/[,\n]/))
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Baca input teks tunggal yang nilainya dipisah koma (mis. `notify_emails`). */
function csv(form: FormData, key: string): string[] {
  return listValues(form, key);
}

/** Baca checkbox group `name` sama (mis. `platform_slugs`), dedupe urutan stabil. */
function checkboxValues(form: FormData, key: string): string[] {
  return [...new Set(listValues(form, key))];
}

/**
 * Simpan konfigurasi automation (singleton id=1). Semua knob divalidasi DB
 * (CHECK). Mengembalikan `AutomationActionResult` agar UI inline bisa
 * menampilkan pesan ramah (bukan digest error generik).
 */
export async function updateAutomationConfig(formData: FormData): Promise<AutomationActionResult> {
  try {
    const supabase = await requireAdmin();
    // BUGFIX 16 Sep: platform diobrol sebagai checkbox group (name sama) —
    // `form.get()` hanya mengambil nilai PERTAMA, sehingga hanya `artikel`
    // yang tersimpan. Pakai `getAll` via `checkboxValues`.
    const platformSlugs = checkboxValues(formData, 'platform_slugs');
    if (platformSlugs.length === 0) return automationFail('pilih minimal 1 platform');
    const scheduleHour = num(formData, 'schedule_hour', 10);
    const scheduleMinute = num(formData, 'schedule_minute', 0);
    if (scheduleHour < 0 || scheduleHour > 23 || scheduleMinute < 0 || scheduleMinute > 59) {
      return automationFail('jam/menit jadwal tidak valid');
    }
    const { error } = await supabase
      .from('automation_configs')
      .update({
        is_enabled: bool(formData, 'is_enabled'),
        schedule_hour: scheduleHour,
        schedule_minute: scheduleMinute,
        timezone: str(formData, 'timezone') ?? 'Asia/Jakarta',
        schedule_window_minutes: num(formData, 'schedule_window_minutes', 180),
        platform_slugs: platformSlugs,
        template_slug: str(formData, 'template_slug'),
        max_topics: num(formData, 'max_topics', 1),
        language: str(formData, 'language') ?? 'both',
        tone: str(formData, 'tone') ?? 'casual',
        audience: str(formData, 'audience') ?? 'umum',
        purpose: str(formData, 'purpose') ?? 'membagikan informasi bermanfaat',
        cta_style: str(formData, 'cta_style') ?? 'soft_sell',
        target_reply_count:
          str(formData, 'target_reply_count') === null ? null : num(formData, 'target_reply_count', 7),
        product_pool_size: num(formData, 'product_pool_size', 50),
        product_category: str(formData, 'product_category'),
        idea_generation_enabled: bool(formData, 'idea_generation_enabled'),
        idea_product_search: bool(formData, 'idea_product_search'),
        require_cover: bool(formData, 'require_cover'),
        cover_max_wait_minutes: num(formData, 'cover_max_wait_minutes', 60),
        cover_max_attempts: num(formData, 'cover_max_attempts', 3),
        auto_publish_article: bool(formData, 'auto_publish_article'),
        max_retry_attempts: num(formData, 'max_retry_attempts', 3),
        notify_on: str(formData, 'notify_on') ?? 'both',
        notify_emails: csv(formData, 'notify_emails'),
        email_from: str(formData, 'email_from') ?? 'Asharu <updates@alamaby.com>',
        email_reply_to: str(formData, 'email_reply_to'),
        updated_at: new Date().toISOString()
      })
      .eq('id', 1);
    if (error) return automationFail(error.message);
    revalidatePath('/admin/automation');
    return automationOk(`Tersimpan (${platformSlugs.join(', ')}).`);
  } catch (e) {
    return automationFail(e);
  }
}

/**
 * Render ringkas hasil tick untuk notice UI — berisi status akhir run atau
 * alasan dilewati agar klik "Run now" selalu memberi feedback jelas.
 */
function renderTickMessage(tick: AutomationTickResult): string {
  if (tick.skipped === 'disabled') {
    return 'Dilewati: automation tidak aktif (kill-switch mati).';
  }
  if (tick.skipped === 'not_due') {
    return 'Dilewati: di luar jendela jadwal (10:00 + 3 jam Asia/Jakarta).';
  }
  if (tick.skipped === 'already_done') {
    return `Dilewati: run hari ini sudah ${tick.status ?? 'selesai'}.`;
  }
  if (tick.status) {
    return tick.runDate
      ? `Tick dijalankan: run ${tick.runDate} → ${tick.status}.`
      : `Tick dijalankan: ${tick.status}.`;
  }
  return 'Tick dijalankan.';
}

/**
 * Jalankan satu tick sekarang (tombol Run now) — mengabaikan jendela jadwal.
 * Tidak pernah melempar: kegagalan diringkas ke `AutomationActionResult`
 * agar komponen client menampilkannya sebagai notice inline.
 */
export async function runAutomationNow(): Promise<AutomationActionResult> {
  try {
    const supabase = await requireAdmin();
    const tick = await runAutomationTick(supabase, { force: true });
    revalidatePath('/admin/automation');
    if (!tick.ok) return automationFail(tick.error ?? 'run gagal');
    return automationOk(renderTickMessage(tick));
  } catch (e) {
    return automationFail(e);
  }
}

/**
 * Reset run yang gagal ke tahap aman untuk dicoba ulang oleh cron:
 * bertahap mundur sesuai data yang sudah ada (cover > publish > developing).
 * Tidak pernah melempar — dipakai dengan notice inline.
 */
export async function retryAutomationRun(runId: string): Promise<AutomationActionResult> {
  try {
    const supabase = await requireAdmin();
  const { data: run } = await supabase
    .from('automation_runs')
    .select('id, status, session_id, article_draft_id')
    .eq('id', runId)
    .maybeSingle();
  const row = run as
    | { id: string; status: string; session_id: string | null; article_draft_id: string | null }
    | null;
  if (!row) return automationFail('run tidak ditemukan');
  if (row.status !== 'failed') return automationFail('run tidak berstatus failed');
  if (!row.session_id) return automationFail('run tanpa sesi — tidak bisa diulang');
  // Sesi riset failed tidak bisa dipulihkan dari sini (perlu perbaikan di
  // halaman riset) — tolak agar admin tidak mengulang tanpa guna.
  const { data: session } = await supabase
    .from('content_research_sessions')
    .select('status')
    .eq('id', row.session_id)
    .maybeSingle();
  if ((session as { status: string } | null)?.status === 'failed') {
    return automationFail('sesi riset berstatus failed — perbaiki sesi di halaman Riset, lalu jalankan Run now');
  }
  const nextStatus = row.article_draft_id ? 'awaiting_cover' : 'developing';
  const { error } = await supabase
    .from('automation_runs')
    .update({
      status: nextStatus,
      error_message: null,
      attempts: 0,
      cover_started_at: null,
      updated_at: new Date().toISOString()
    })
    .eq('id', runId)
    .eq('status', 'failed');
  if (error) return automationFail(error.message);
  revalidatePath('/admin/automation');
  return automationOk(`Run dikembalikan ke ${nextStatus}.`);
  } catch (e) {
    return automationFail(e);
  }
}

