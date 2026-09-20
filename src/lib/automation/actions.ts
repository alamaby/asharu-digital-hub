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
 * `slotKey` opsional: bila diisi hanya proses slot itu; kosong = semua slot enabled.
 * Tidak pernah melempar: kegagalan diringkas ke `AutomationActionResult`
 * agar komponen client menampilkannya sebagai notice inline.
 */
export async function runAutomationNow(slotKey?: string): Promise<AutomationActionResult> {
  try {
    const supabase = await requireAdmin();
    const tick = await runAutomationTick(supabase, { force: true, slotKey: slotKey || undefined });
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

/**
 * Kirim email test automation ke penerima yangterkonfigurasi (atau admin).
 * Admin-only; tidak pernah melempar — semua error diringkas ke AutomationActionResult.
 * Resend ID / error asli dikembalikan agar badge UI bisa menampilkan "terkirim (id...)" atau "gagal: ...".
 */
export async function sendAutomationTestEmail(): Promise<AutomationActionResult> {
  try {
    const supabase = await requireAdmin();
    const cfgModule = await import('@/lib/automation/config');
    const cfg = await cfgModule.loadAutomationConfig(supabase);
    const recipients = cfg ? await cfgModule.resolveRecipients(supabase, cfg) : [];
    const { resolveResendKey } = await import('@/lib/automation/email');
    const apiKey = await resolveResendKey(supabase);
    if (!apiKey) {
      void supabase.from('automation_email_log').insert({
        moment: 'test',
        recipients: [],
        ok: false,
        skipped: true,
        error: 'resend key not configured'
      });
      return automationFail('Resend key belum dikonfigurasi di Vault/env');
    }
    const { sendDraftReadyEmail } = await import('@/lib/automation/email');
    const envModule = await import('@/lib/env');
    const emailFrom = cfg?.emailFrom ?? 'Asharu <updates@alamaby.com>';
    const emailReplyTo = cfg?.emailReplyTo ?? null;
    const res = await sendDraftReadyEmail(supabase, {
      id: 0,
      isEnabled: true,
      scheduleHour: 10,
      scheduleMinute: 0,
      timezone: 'Asia/Jakarta',
      scheduleWindowMinutes: 180,
      mechanism: 'dua',
      platformSlugs: [],
      templateSlug: null,
      maxTopics: 1,
      language: 'both',
      tone: 'casual',
      audience: 'umum',
      purpose: 'x',
      ctaStyle: 'soft_sell',
      targetReplyCount: null,
      productPoolSize: 50,
      productCategory: null,
      ideaGenerationEnabled: false,
      ideaProductSearch: true,
      requireCover: false,
      coverMaxWaitMinutes: 60,
      coverMaxAttempts: 3,
      autoPublishArticle: false,
      maxRetryAttempts: 3,
      notifyOn: 'none',
      notifyEmails: [],
      emailFrom,
      emailReplyTo
    } as never, {
      recipients,
      runDate: new Date().toISOString().slice(0, 10),
      productName: '(test)',
      drafts: [],
      siteUrl: envModule.env.siteUrl
    });
    revalidatePath('/admin/automation');
    if (!res.ok) {
      return automationFail(res.error ?? 'email test gagal');
    }
    return automationOk(`Terkirim${recipients.length ? ' ke ' + recipients.join(', ') : ''}${res.id ? ` (id ${res.id})` : ''}`);
  } catch (e) {
    return automationFail(e);
  }
}

/** Select tri-state ""/"true"/"false" → null/true/false. */
function triBool(form: FormData, key: string): boolean | null {
  const raw = form.get(key);
  if (raw == null || raw === '') return null;
  return raw === 'true';
}

function numNull(form: FormData, key: string): number | null {
  const raw = form.get(key);
  if (raw == null || String(raw).trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// --- Slot CRUD --------------------------------------------------------------

/** Regex slot_key: lowercase alphanumeric + hyphen, 1–32 chars. */
const SLOT_KEY_RE = /^[a-z0-9-]{1,32}$/;
const MAX_ENABLED_SLOTS_PER_DAY = 4;

async function countEnabledSlots(supabase: NonNullable<ReturnType<typeof createSupabaseService>>): Promise<number> {
  try {
    const { count } = await supabase
      .from('automation_schedules')
      .select('*', { count: 'exact', head: true })
      .eq('is_enabled', true);
    return count ?? 0;
  } catch {
    return 0;
  }
}

/** Buat slot baru. Divalidasi DB (CHECK) + app-level cap & format. */
export async function createAutomationSlot(formData: FormData): Promise<AutomationActionResult> {
  try {
    const supabase = await requireAdmin();
    const slotKey = str(formData, 'slot_key');
    if (!slotKey || !SLOT_KEY_RE.test(slotKey)) {
      return automationFail('slot_key wajib huruf kecil/angka/hyphen, maks 32 karakter');
    }
    const hour = num(formData, 'hour', 10);
    const minute = num(formData, 'minute', 0);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return automationFail('jam 0–23, menit 0–59');
    }
    const weekdays = num(formData, 'weekdays', 127);
    if (weekdays < 0 || weekdays > 127) return automationFail('weekdays 0–127');
    const windowMinutes = str(formData, 'window_minutes') === null ? null : num(formData, 'window_minutes', 60);
    if (windowMinutes !== null && (windowMinutes < 5 || windowMinutes > 720)) {
      return automationFail('window_minutes 5–720');
    }
    const label = str(formData, 'label') ?? slotKey;
    const isNewEnabled = bool(formData, 'is_enabled');
    if (isNewEnabled) {
      const enabledCount = await countEnabledSlots(supabase);
      if (enabledCount >= MAX_ENABLED_SLOTS_PER_DAY) {
        return automationFail(`maksimal ${MAX_ENABLED_SLOTS_PER_DAY} slot aktif per hari`);
      }
    }
    const { error } = await supabase.from('automation_schedules').insert({
      slot_key: slotKey,
      label,
      hour,
      minute,
      weekdays,
      is_enabled: bool(formData, 'is_enabled'),
      window_minutes: windowMinutes,
      priority: num(formData, 'priority', 0)
    });
    if (error) return automationFail(error.message);
    revalidatePath('/admin/automation');
    return automationOk(`Slot ${slotKey} dibuat.`);
  } catch (e) {
    return automationFail(e);
  }
}

/** Perbarui slot yang sudah ada. Field kosong/null tetap menjadi NULL agar runner warisi global. */
export async function updateAutomationSlot(formData: FormData): Promise<AutomationActionResult> {
  try {
    const supabase = await requireAdmin();
    const slotKey = str(formData, 'slot_key');
    if (!slotKey) return automationFail('slot_key wajib');
    const notifyOnRaw = str(formData, 'notify_on');
    if (notifyOnRaw !== null && !['draft_ready', 'published', 'both', 'none'].includes(notifyOnRaw)) {
      return automationFail('notify_on tidak valid');
    }
    const hour = num(formData, 'hour', 10);
    const minute = num(formData, 'minute', 0);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return automationFail('jam 0–23, menit 0–59');
    }
    const weekdays = num(formData, 'weekdays', 127);
    if (weekdays < 0 || weekdays > 127) return automationFail('weekdays 0–127');
    const windowMinutes = numNull(formData, 'window_minutes');
    if (windowMinutes !== null && (windowMinutes < 5 || windowMinutes > 720)) {
      return automationFail('window_minutes 5–720');
    }
    const maxTopics = numNull(formData, 'max_topics');
    if (maxTopics !== null && (maxTopics < 1 || maxTopics > 10)) return automationFail('max_topics 1–10');
    const productPoolSize = numNull(formData, 'product_pool_size');
    if (productPoolSize !== null && (productPoolSize < 1 || productPoolSize > 500)) {
      return automationFail('product_pool_size 1–500');
    }
    const maximumIterations = numNull(formData, 'maximum_iterations');
    if (maximumIterations !== null && (maximumIterations < 1 || maximumIterations > 5)) {
      return automationFail('maximum_iterations 1–5');
    }
    const minimumScore = numNull(formData, 'minimum_score');
    if (minimumScore !== null && (minimumScore < 0 || minimumScore > 100)) {
      return automationFail('minimum_score 0–100');
    }
    const minimumCandidates = numNull(formData, 'minimum_candidates');
    if (minimumCandidates !== null && (minimumCandidates < 1 || minimumCandidates > 50)) {
      return automationFail('minimum_candidates 1–50');
    }
    const freshnessHours = numNull(formData, 'freshness_hours');
    if (freshnessHours !== null && (freshnessHours < 1 || freshnessHours > 720)) {
      return automationFail('freshness_hours 1–720');
    }
    const coverMaxWaitMinutes = numNull(formData, 'cover_max_wait_minutes');
    if (coverMaxWaitMinutes !== null && (coverMaxWaitMinutes < 5 || coverMaxWaitMinutes > 720)) {
      return automationFail('cover_max_wait_minutes 5–720');
    }
    const coverMaxAttempts = numNull(formData, 'cover_max_attempts');
    if (coverMaxAttempts !== null && (coverMaxAttempts < 1 || coverMaxAttempts > 10)) {
      return automationFail('cover_max_attempts 1–10');
    }
    const maxRetryAttempts = numNull(formData, 'max_retry_attempts');
    if (maxRetryAttempts !== null && (maxRetryAttempts < 0 || maxRetryAttempts > 10)) {
      return automationFail('max_retry_attempts 0–10');
    }
    const targetReplyCount = numNull(formData, 'target_reply_count');
    if (targetReplyCount !== null && (targetReplyCount < 1 || targetReplyCount > 10)) {
      return automationFail('target_reply_count 1–10');
    }
    const platformSlugs = (() => {
      const v = checkboxValues(formData, 'platform_slugs');
      return v.length ? v : null;
    })();
    const patch: Record<string, unknown> = {
      label: str(formData, 'label') ?? '',
      hour,
      minute,
      weekdays,
      is_enabled: bool(formData, 'is_enabled'),
      window_minutes: windowMinutes,
      priority: num(formData, 'priority', 0),
      platform_slugs: platformSlugs,
      max_topics: maxTopics,
      product_pool_size: productPoolSize,
      product_category: str(formData, 'product_category'),
      auto_publish_article: triBool(formData, 'auto_publish_article'),
      require_cover: triBool(formData, 'require_cover'),
      notify_on: notifyOnRaw,
      notify_emails: (() => {
        const v = csv(formData, 'notify_emails');
        return v.length ? v : null;
      })(),
      maximum_iterations: maximumIterations,
      minimum_score: minimumScore,
      minimum_candidates: minimumCandidates,
      freshness_hours: freshnessHours,
      cover_max_wait_minutes: coverMaxWaitMinutes,
      cover_max_attempts: coverMaxAttempts,
      max_retry_attempts: maxRetryAttempts,
      language: str(formData, 'language'),
      tone: str(formData, 'tone'),
      audience: str(formData, 'audience'),
      purpose: str(formData, 'purpose'),
      cta_style: str(formData, 'cta_style'),
      target_reply_count: targetReplyCount,
      template_slug: str(formData, 'template_slug'),
      idea_generation_enabled: triBool(formData, 'idea_generation_enabled'),
      idea_product_search: triBool(formData, 'idea_product_search'),
      email_from: str(formData, 'email_from'),
      email_reply_to: str(formData, 'email_reply_to'),
      updated_at: new Date().toISOString()
    };
    const { error } = await supabase.from('automation_schedules').update(patch).eq('slot_key', slotKey);
    if (error) return automationFail(error.message);
    revalidatePath('/admin/automation');
    return automationOk(`Slot ${slotKey} diperbarui.`);
  } catch (e) {
    return automationFail(e);
  }
}

/** Toggle on/off slot tanpa menghapus. */
export async function toggleAutomationSlot(slotKey: string): Promise<AutomationActionResult> {
  try {
    const supabase = await requireAdmin();
    const { data: row } = await supabase
      .from('automation_schedules')
      .select('is_enabled')
      .eq('slot_key', slotKey)
      .maybeSingle();
    const r = row as { is_enabled: boolean } | null;
    if (!r) return automationFail('slot tidak ditemukan');
    const { error } = await supabase
      .from('automation_schedules')
      .update({ is_enabled: !r.is_enabled, updated_at: new Date().toISOString() })
      .eq('slot_key', slotKey);
    if (error) return automationFail(error.message);
    revalidatePath('/admin/automation');
    return automationOk(`Slot ${slotKey} ${!r.is_enabled ? 'diaktifkan' : 'dinonaktifkan'}.`);
  } catch (e) {
    return automationFail(e);
  }
}

/** Hapus slot; tolak bila masih ada run merujuk. */
export async function deleteAutomationSlot(slotKey: string): Promise<AutomationActionResult> {
  try {
    const supabase = await requireAdmin();
    if (slotKey === 'default') return automationFail('slot default tidak bisa dihapus');
    const { count } = await supabase
      .from('automation_runs')
      .select('*', { count: 'exact', head: true })
      .eq('slot_key', slotKey);
    if ((count ?? 0) > 0) {
      return automationFail(`slot ${slotKey} masih punya ${count} run — hapus run dulu`);
    }
    const { error } = await supabase.from('automation_schedules').delete().eq('slot_key', slotKey);
    if (error) return automationFail(error.message);
    revalidatePath('/admin/automation');
    return automationOk(`Slot ${slotKey} dihapus.`);
  } catch (e) {
    return automationFail(e);
  }
}

