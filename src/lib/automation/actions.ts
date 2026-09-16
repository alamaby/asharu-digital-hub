'use server';

import { revalidatePath } from 'next/cache';
import { isAdmin } from '@/lib/auth/is-admin';
import { createSupabaseService } from '@/lib/supabase/server';
import { runAutomationTick } from '@/lib/automation/runner';

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

function csv(form: FormData, key: string): string[] {
  const raw = form.get(key);
  if (raw == null) return [];
  return String(raw)
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Simpan konfigurasi automation (singleton id=1). Semua knob divalidasi DB
 * (CHECK) — error dilempar apa adanya agar admin tahu nilai mana yang salah
 * (pola `updateSocialConfig`).
 */
export async function updateAutomationConfig(formData: FormData): Promise<void> {
  const supabase = await requireAdmin();
  const platformSlugs = csv(formData, 'platform_slugs');
  if (platformSlugs.length === 0) throw new Error('pilih minimal 1 platform');
  const scheduleHour = num(formData, 'schedule_hour', 10);
  const scheduleMinute = num(formData, 'schedule_minute', 0);
  if (scheduleHour < 0 || scheduleHour > 23 || scheduleMinute < 0 || scheduleMinute > 59) {
    throw new Error('jam/menit jadwal tidak valid');
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
  if (error) throw new Error(error.message);
  revalidatePath('/admin/automation');
}

/** Jalankan satu tick sekarang (tombol Run now) — mengabaikan jendela jadwal. */
export async function runAutomationNow(): Promise<void> {
  const supabase = await requireAdmin();
  const result = await runAutomationTick(supabase, { force: true });
  revalidatePath('/admin/automation');
  if (!result.ok) throw new Error(result.error ?? 'run gagal');
}

/**
 * Reset run yang gagal ke tahap aman untuk dicoba ulang oleh cron:
 * bertahap mundur sesuai data yang sudah ada (cover > publish > developing).
 */
export async function retryAutomationRun(runId: string): Promise<void> {
  const supabase = await requireAdmin();
  const { data: run } = await supabase
    .from('automation_runs')
    .select('id, status, session_id, article_draft_id')
    .eq('id', runId)
    .maybeSingle();
  const row = run as
    | { id: string; status: string; session_id: string | null; article_draft_id: string | null }
    | null;
  if (!row) throw new Error('run tidak ditemukan');
  if (row.status !== 'failed') throw new Error('run tidak berstatus failed');
  if (!row.session_id) throw new Error('run tanpa sesi — tidak bisa diulang');
  // Sesi riset failed tidak bisa dipulihkan dari sini (perlu perbaikan di
  // halaman riset) — tolak agar admin tidak mengulang tanpa guna.
  const { data: session } = await supabase
    .from('content_research_sessions')
    .select('status')
    .eq('id', row.session_id)
    .maybeSingle();
  if ((session as { status: string } | null)?.status === 'failed') {
    throw new Error('sesi riset berstatus failed — perbaiki sesi di halaman Riset, lalu jalankan Run now');
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
  if (error) throw new Error(error.message);
  revalidatePath('/admin/automation');
}

