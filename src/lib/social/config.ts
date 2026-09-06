export type SocialLang = 'id' | 'en';
export type QueueStatus = 'queued' | 'posting' | 'posted' | 'failed' | 'canceled';

export interface SocialAccount {
  id: string;
  platform_slug: string;
  handle: string;
  threads_user_id: string | null;
  vault_secret_name: string;
  scopes: string[];
  token_expires_at: string | null;
  status: string;
  priority: number;
  is_active: boolean;
}

export interface SocialPostConfig {
  platform_slug: string;
  is_enabled: boolean;
  auto_queue_on_approve: boolean;
  default_lang: SocialLang;
  allow_lang_override: boolean;
  daily_cap: number;
  post_window_start: string; // 'HH:mm'
  post_window_end: string; // 'HH:mm'
  min_interval_minutes: number;
  account_id: string | null;
}

export interface GeneratedThread {
  main: { id: string; en: string };
  replies: { id: string; en: string }[];
}

/**
 * Idempotency key per (draft, platform) — queue 1 baris per draf per platform.
 * Unik + stabil agar approve ganda tidak membuat antrean ganda.
 */
export function buildIdempotencyKey(draftId: string, platformSlug: string): string {
  return `${draftId}:${platformSlug}`;
}

/**
 * Resolver akun: queue.account_id > config.account_id > akun aktif prioritas teratas.
 * Mengikuti pola resolveStageModel (override > default > waterfall).
 */
export function resolveAccount(
  config: SocialPostConfig,
  accounts: SocialAccount[],
  queueAccountId: string | null
): SocialAccount | null {
  const active = accounts.filter(
    (a) => a.platform_slug === config.platform_slug && a.is_active && a.status === 'active'
  );
  if (active.length === 0) return null;
  if (queueAccountId) {
    const pinned = active.find((a) => a.id === queueAccountId);
    if (pinned) return pinned;
  }
  if (config.account_id) {
    const pinned = active.find((a) => a.id === config.account_id);
    if (pinned) return pinned;
  }
  return [...active].sort((a, b) => a.priority - b.priority)[0] ?? null;
}

/** Parse 'HH:mm' → menit sejak tengah malam. Return null bila format invalid. */
export function parseWindowTime(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Hitung slot terjadwal berikutnya:
 * - mulai dari max(now, lastScheduled + minInterval)
 * - jepit ke dalam window [start, end] hari yang sama (WIB diasumsikan di level cron/route)
 * - bila lewat window, geser ke start hari berikutnya
 * Pure (testable): `now` dan `lastScheduledAt` di-inject.
 */
export function nextSlot(
  now: Date,
  lastScheduledAt: Date | null,
  config: Pick<SocialPostConfig, 'post_window_start' | 'post_window_end' | 'min_interval_minutes'>
): Date {
  const startMin = parseWindowTime(config.post_window_start) ?? 7 * 60;
  const endMin = parseWindowTime(config.post_window_end) ?? 21 * 60;
  const intervalMs = Math.max(5, config.min_interval_minutes) * 60_000;

  let candidate = new Date(now.getTime());
  if (lastScheduledAt) {
    const floor = new Date(lastScheduledAt.getTime() + intervalMs);
    if (floor.getTime() > candidate.getTime()) candidate = floor;
  }

  const dayStart = new Date(candidate);
  dayStart.setHours(0, 0, 0, 0);
  const windowStart = new Date(dayStart.getTime() + startMin * 60_000);
  const windowEnd = new Date(dayStart.getTime() + endMin * 60_000);

  if (candidate.getTime() < windowStart.getTime()) return windowStart;
  if (candidate.getTime() > windowEnd.getTime()) {
    const nextDay = new Date(dayStart.getTime() + 24 * 60 * 60_000 + startMin * 60_000);
    return nextDay;
  }
  return candidate;
}

/**
 * Ambil teks thread sesuai bahasa pilihan (id/en).
 * Opener + replies berurutan — dipakai worker untuk reply chain.
 */
export function extractThreadTexts(thread: GeneratedThread, lang: SocialLang): string[] {
  const pick = (post: { id: string; en: string }): string =>
    (lang === 'id' ? post.id : post.en).trim();
  return [pick(thread.main), ...thread.replies.map(pick)].filter((t) => t.length > 0);
}

/** Bahasa efektif: queue.lang bila override diizinkan, else config default. */
export function effectiveLang(
  config: Pick<SocialPostConfig, 'default_lang' | 'allow_lang_override'>,
  requested: SocialLang | null | undefined
): SocialLang {
  if (config.allow_lang_override && (requested === 'id' || requested === 'en')) return requested;
  return config.default_lang;
}
