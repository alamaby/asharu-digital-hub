'use server';

import { revalidatePath } from 'next/cache';
import { isAdmin } from '@/lib/auth/is-admin';
import { createSupabaseService } from '@/lib/supabase/server';
import {
  buildIdempotencyKey,
  effectiveLang,
  nextSlot,
  type SocialLang
} from './config';

async function requireAdmin() {
  if (!(await isAdmin())) throw new Error('Unauthorized: admin only');
  const supabase = createSupabaseService();
  if (!supabase) throw new Error('Supabase not configured');
  return supabase;
}

interface QueueRow {
  scheduled_at: string;
}

/**
 * Approve draf + enqueue ke antrean Threads terjadwal (idempoten).
 * Menggantikan client-direct update agar setiap approve otomatis terjadwal.
 * `lang` = pilihan bahasa saat approve (dihormati bila config.allow_lang_override).
 */
export async function approveDraftAndQueue(draftId: string, lang: SocialLang = 'id') {
  const supabase = await requireAdmin();
  if (!draftId) throw new Error('draftId required');
  if (lang !== 'id' && lang !== 'en') throw new Error('lang must be id|en');

  const { data: config } = await supabase
    .from('social_post_configs')
    .select('platform_slug, auto_queue_on_approve, default_lang, allow_lang_override, post_window_start, post_window_end, min_interval_minutes')
    .eq('platform_slug', 'threads')
    .maybeSingle();
  const cfg = (config ?? {
    platform_slug: 'threads',
    auto_queue_on_approve: true,
    default_lang: 'id',
    allow_lang_override: true,
    post_window_start: '07:00',
    post_window_end: '21:00',
    min_interval_minutes: 30
  }) as {
    auto_queue_on_approve: boolean;
    default_lang: SocialLang;
    allow_lang_override: boolean;
    post_window_start: string;
    post_window_end: string;
    min_interval_minutes: number;
  };

  const finalLang = effectiveLang(cfg, lang);

  const { error: approveError } = await supabase
    .from('content_drafts')
    .update({ status: 'approved' })
    .eq('id', draftId);
  if (approveError) throw new Error(approveError.message);

  if (!cfg.auto_queue_on_approve) {
    revalidatePath('/konten/review');
    revalidatePath('/konten/review/[draftId]', 'page');
    return { queued: false, lang: finalLang };
  }

  const { data: last } = await supabase
    .from('social_post_queue')
    .select('scheduled_at')
    .eq('platform_slug', 'threads')
    .order('scheduled_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastAt = (last as QueueRow | null)?.scheduled_at
    ? new Date((last as QueueRow).scheduled_at)
    : null;
  const scheduledAt = nextSlot(new Date(), lastAt, cfg);

  const { error: queueError } = await supabase.from('social_post_queue').upsert(
    {
      draft_id: draftId,
      platform_slug: 'threads',
      lang: finalLang,
      scheduled_at: scheduledAt.toISOString(),
      status: 'queued',
      idempotency_key: buildIdempotencyKey(draftId, 'threads')
    },
    { onConflict: 'idempotency_key' }
  );
  if (queueError) throw new Error(queueError.message);

  revalidatePath('/konten/review');
  revalidatePath('/konten/review/[draftId]', 'page');
  revalidatePath('/admin/sosial');
  return { queued: true, lang: finalLang, scheduledAt: scheduledAt.toISOString() };
}

/** Update knob config per-platform (semua configurable by table). */
export async function updateSocialConfig(platformSlug: string, formData: FormData) {
  const supabase = await requireAdmin();
  const patch: Record<string, unknown> = {};
  const bool = (key: string) => {
    const raw = formData.get(key);
    if (raw === 'on' || raw === 'true') patch[key] = true;
    else if (raw === 'off' || raw === 'false') patch[key] = false;
  };
  bool('is_enabled');
  bool('auto_queue_on_approve');
  bool('allow_lang_override');
  const defaultLang = String(formData.get('default_lang') ?? '').trim();
  if (defaultLang === 'id' || defaultLang === 'en') patch.default_lang = defaultLang;
  const dailyCap = Number(formData.get('daily_cap'));
  if (Number.isFinite(dailyCap) && dailyCap > 0) patch.daily_cap = Math.min(250, Math.floor(dailyCap));
  const interval = Number(formData.get('min_interval_minutes'));
  if (Number.isFinite(interval) && interval >= 5) patch.min_interval_minutes = Math.floor(interval);
  for (const key of ['post_window_start', 'post_window_end'] as const) {
    const raw = String(formData.get(key) ?? '').trim();
    if (/^\d{1,2}:\d{2}$/.test(raw)) patch[key] = raw;
  }
  const accountId = String(formData.get('account_id') ?? '').trim();
  if (accountId) patch.account_id = accountId;
  if (Object.keys(patch).length === 0) throw new Error('No valid fields');
  const { error } = await supabase
    .from('social_post_configs')
    .update(patch)
    .eq('platform_slug', platformSlug);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/sosial');
}

/** Toggle akun aktif/nonaktif. */
export async function toggleSocialAccount(accountId: string, isActive: boolean) {
  const supabase = await requireAdmin();
  const { error } = await supabase
    .from('social_accounts')
    .update({ is_active: isActive })
    .eq('id', accountId);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/sosial');
}

/** Kembalikan queue failed → queued (coba lagi di tick berikutnya). */
export async function retrySocialQueue(queueId: string) {
  const supabase = await requireAdmin();
  const { error } = await supabase
    .from('social_post_queue')
    .update({ status: 'queued', last_error: null })
    .eq('id', queueId);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/sosial');
}

/** Batalkan antrean (tidak diposting). */
export async function cancelSocialQueue(queueId: string) {
  const supabase = await requireAdmin();
  const { error } = await supabase
    .from('social_post_queue')
    .update({ status: 'canceled' })
    .eq('id', queueId);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/sosial');
}
