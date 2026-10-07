import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Klaim antrean poster sosial — dipisah dari route agar bisa diuji tanpa HTTP.
 *
 * Kontrak penting: `UPDATE ... WHERE status='queued'` bersifat atomik di
 * Postgres, tapi pemanggil WAJIB memverifikasi bahwa baris benar-benar berpindah
 * status (`.select('id')`). Tanpa itu PostgREST mengembalikan 0 baris **tanpa
 * error**, dan dua invocation paralel akan mem-publish thread yang sama dua kali.
 */

export const DEFAULT_PLATFORM_SLUG = 'threads';
export const MAX_QUEUE_ATTEMPTS = 5;

/**
 * Ambang klaim basi. Tick worker berjalan tiap 5 menit (cron
 * `asharu-social-poster`) dan dikirim dengan timeout 280s, jadi 15 menit
 * memberi ruang kira-kira dua tick gagal sebelum baris dianggap ditinggalkan.
 */
export const STALE_CLAIM_MINUTES = 15;

export interface QueueItem {
  id: string;
  draft_id: string;
  platform_slug: string;
  account_id: string | null;
  lang: 'id' | 'en';
  status: string;
  attempts: number;
  image_url: string | null;
  image_urls: Record<string, string> | null;
}

export type ClaimOutcome =
  | { outcome: 'claimed'; item: QueueItem }
  | { outcome: 'idle' }
  | { outcome: 'raced' }
  | { outcome: 'exhausted'; item: QueueItem };

export interface ReapResult {
  requeued: number;
  failed: number;
  errors: string[];
}

/**
 * Kembalikan baris `'posting'` yang klaimnya basi ke `'queued'` (attempts masih
 * tersisa — tick berikutnya me-resume dari `social_post_logs`, jadi post yang
 * sudah terkirim tidak diulang) atau tandai `'failed'` bila attempts habis.
 *
 * Tanpa reaper ini, invocation yang mati setelah klaim (function dibunuh,
 * deploy, upstream menggantung) meninggalkan baris `'posting'` selamanya:
 * klaim mensyaratkan `status='queued'`, jadi thread-nya tidak pernah terkirim.
 *
 * Patokan waktu = `claimed_at`, BUKAN `scheduled_at`: baris bisa dijadwalkan
 * jauh di masa lalu (worker mati beberapa hari) lalu baru diklaim sekarang, dan
 * memakai `scheduled_at` akan merebut klaim yang masih berjalan. Baris legacy
 * dengan `claimed_at IS NULL` (diklaim versi lama sebelum kolom ini ada) tetap
 * ditangani lewat `scheduled_at`.
 */
export async function reapStaleClaims(
  supabase: SupabaseClient,
  options: { now?: Date; staleMinutes?: number; maxAttempts?: number; platformSlug?: string } = {}
): Promise<ReapResult> {
  const staleMinutes = options.staleMinutes ?? STALE_CLAIM_MINUTES;
  const maxAttempts = options.maxAttempts ?? MAX_QUEUE_ATTEMPTS;
  const platformSlug = options.platformSlug ?? DEFAULT_PLATFORM_SLUG;
  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - staleMinutes * 60_000).toISOString();

  const result: ReapResult = { requeued: 0, failed: 0, errors: [] };

  const sweep = async (
    patch: Record<string, unknown>,
    attemptsFilter: 'remaining' | 'exhausted'
  ): Promise<number> => {
    const query = supabase
      .from('social_post_queue')
      .update(patch)
      .eq('platform_slug', platformSlug)
      .eq('status', 'posting')
      .or(`claimed_at.lt.${cutoff},and(claimed_at.is.null,scheduled_at.lt.${cutoff})`);
    const filtered =
      attemptsFilter === 'remaining'
        ? query.lt('attempts', maxAttempts)
        : query.gte('attempts', maxAttempts);
    const { data, error } = await filtered.select('id');
    if (error) {
      result.errors.push(error.message);
      return 0;
    }
    return (data ?? []).length;
  };

  result.requeued = await sweep(
    {
      status: 'queued',
      claimed_at: null,
      last_error: `reaper: klaim basi (>${staleMinutes} menit) dikembalikan ke antrean`
    },
    'remaining'
  );
  result.failed = await sweep(
    {
      status: 'failed',
      claimed_at: null,
      last_error: `reaper: klaim basi (>${staleMinutes} menit) & attempts habis (${maxAttempts})`
    },
    'exhausted'
  );

  return result;
}

/**
 * Ambil satu antrean jatuh tempo lalu klaim. `raced` berarti invocation lain
 * sudah memenangkan klaim (0 baris terpengaruh) — pemanggil harus berhenti
 * tanpa mem-publish apa pun.
 */
export async function claimDueQueueItem(
  supabase: SupabaseClient,
  options: { now?: Date; maxAttempts?: number; platformSlug?: string } = {}
): Promise<ClaimOutcome> {
  const maxAttempts = options.maxAttempts ?? MAX_QUEUE_ATTEMPTS;
  const platformSlug = options.platformSlug ?? DEFAULT_PLATFORM_SLUG;
  const nowIso = (options.now ?? new Date()).toISOString();

  const { data: due } = await supabase
    .from('social_post_queue')
    .select(
      'id, draft_id, platform_slug, account_id, lang, status, attempts, image_url, image_urls'
    )
    .eq('platform_slug', platformSlug)
    .eq('status', 'queued')
    .lte('scheduled_at', nowIso)
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  const item = due as unknown as QueueItem | null;
  if (!item) return { outcome: 'idle' };

  if (item.attempts >= maxAttempts) {
    await supabase
      .from('social_post_queue')
      .update({ status: 'failed', last_error: `max attempts (${maxAttempts})` })
      .eq('id', item.id);
    return { outcome: 'exhausted', item };
  }

  const { data: claimed, error: claimError } = await supabase
    .from('social_post_queue')
    .update({ status: 'posting', attempts: item.attempts + 1, claimed_at: nowIso })
    .eq('id', item.id)
    .eq('status', 'queued')
    .select('id')
    .maybeSingle();

  if (claimError || !claimed) return { outcome: 'raced' };
  return { outcome: 'claimed', item: { ...item, attempts: item.attempts + 1 } };
}
