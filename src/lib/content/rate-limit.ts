import { getServiceClient } from '@/lib/supabase/service';

export interface RateLimitResult {
  allowed: boolean;
  count: number;
}

export const DEFAULT_RATE_LIMIT_WINDOW_MINUTES = 60;

/**
 * Fixed-window rate limit per (IP, scope), **atomik**.
 *
 * Satu panggilan = satu round-trip: RPC `consume_rate_limit` melakukan
 * `INSERT ... ON CONFLICT (ip, scope) DO UPDATE` dan mengembalikan `allowed`
 * beserta `count` baru. Pengganti pola `checkRateLimit` + `incrementRateLimit`
 * yang bocor: dua request paralel sama-sama membaca `count=4`, dua-duanya lolos,
 * lalu dua-duanya menulis 5 (lihat migrasi 20261007000001).
 *
 * Semantik: setiap panggilan mengonsumsi satu slot — termasuk percobaan yang
 * nanti gagal validasi. Batasnya mengikat pada laju request, bukan laju sukses.
 *
 * Fail-open: bila RPC gagal (DB hiccup, migrasi belum di-apply), request
 * diizinkan dan error dicatat. Guard ini melindungi sumber daya bersama (kuota
 * LLM, tulis DB), bukan gerbang autentikasi — form publik tidak boleh mati
 * karena kegagalan rate limit. Perilaku ini sama dengan implementasi lama.
 */
export async function consumeRateLimit(
  ip: string,
  scope = 'content_request',
  limit = 5,
  windowMinutes = DEFAULT_RATE_LIMIT_WINDOW_MINUTES
): Promise<RateLimitResult> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc('consume_rate_limit', {
    p_ip: ip,
    p_scope: scope,
    p_limit: limit,
    p_window_minutes: windowMinutes
  });

  if (error) {
    console.error(`[rate-limit] consume_rate_limit gagal (scope=${scope}): ${error.message}`);
    return { allowed: true, count: 0 };
  }

  // PostgREST mengembalikan array untuk fungsi set-returning.
  const row = (Array.isArray(data) ? data[0] : data) as
    | { allowed?: boolean | null; count?: number | null }
    | null
    | undefined;
  if (!row) return { allowed: true, count: 0 };
  return { allowed: Boolean(row.allowed), count: Number(row.count ?? 0) };
}

/**
 * Hapus baris `rate_limits` yang window-nya sudah lama lewat. Dipanggil dari
 * cron cleanup harian (`/api/lab/cleanup`); tanpa ini tabel tumbuh selamanya.
 */
export async function cleanupExpiredRateLimits(
  olderThanMinutes = 1440
): Promise<{ deleted: number }> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc('cleanup_expired_rate_limits', {
    p_older_than_minutes: olderThanMinutes
  });
  if (error) throw new Error(`cleanup_expired_rate_limits: ${error.message}`);
  return { deleted: typeof data === 'number' ? data : 0 };
}

/**
 * IP klien untuk rate limit.
 *
 * Urutan: `x-vercel-forwarded-for` → `x-real-ip` → `x-forwarded-for`.
 * Vercel menimpa `x-forwarded-for` (IP eksternal dari klien tidak diteruskan,
 * lihat Vercel docs "Request headers") sehingga entry pertama tidak bisa
 * dipalsukan di deployment ini; `x-vercel-forwarded-for`/`x-real-ip` dipilih
 * lebih dulu karena tetap benar bila ada proxy resmi di depan Vercel.
 * Tanpa header apa pun → `'unknown'`: satu bucket bersama, tetap dibatasi
 * honeypot + validasi DB di pemanggilnya.
 */
export function getClientIp(headers: Headers): string {
  const vercelForwarded = headers.get('x-vercel-forwarded-for');
  if (vercelForwarded) return vercelForwarded.split(',')[0]!.trim();
  const realIp = headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return 'unknown';
}
