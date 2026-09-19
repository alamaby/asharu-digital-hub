import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AutomationConfig } from './config';
/** Bitmask weekdays: bit0=Senin ... bit6=Minggu. */
export const WEEKDAY_BITS = {
  mon: 1,
  tue: 2,
  wed: 4,
  thu: 8,
  fri: 16,
  sat: 32,
  sun: 64
} as const;

/** Hari lokal (1=Senin ... 7=Minggu, sesuai ISO; dipakai untuk mapping). */
export function localWeekdayIndex(date: Date, timezone: string): number {
  // Intl petakan singkat -> 'Mon'...'Sun'. getDay() server bisa UTC ≠ config tz.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short'
  });
  const dayName = fmt.format(date);
  const map: Record<string, number> = {
    Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6
  };
  const idx = map[dayName as keyof typeof map];
  if (idx === undefined) throw new Error(`weekday unknown: ${dayName}`);
  return idx;
}

/** Konversi Date → weekday bitmask (1 bit per hari). */
export function weekdayBit(date: Date, timezone: string): number {
  return 1 << localWeekdayIndex(date, timezone);
}

export interface SlotRow {
  id: string;
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
  /** Fase 3: discovery override. */
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
  created_at: string;
  updated_at: string;
}

/** Window per slot: gunakan nilai override bila ada, fallback ke global cfg. */
function resolveWindowMinutes(
  slot: SlotRow,
  cfg: { scheduleWindowMinutes: number }
): number {
  if (slot.window_minutes != null && slot.window_minutes >= 5 && slot.window_minutes <= 720) {
    return slot.window_minutes;
  }
  return cfg.scheduleWindowMinutes;
}

/**
 * True bila `now` berada di jendela `[target, target + window)` weekday slot
 * yang cocok, pada zona waktu cfg.timezone. `startMinutes` opsional untuk
 * test deterministik (menggantikan konversi TZ).
 */
export function isSlotDue(
  slot: SlotRow,
  cfg: { scheduleWindowMinutes: number; timezone: string },
  now: Date,
  startMinutes?: number
): boolean {
  if (!slot.is_enabled) return false;
  const bit = weekdayBit(now, cfg.timezone);
  if ((slot.weekdays & bit) === 0) return false;
  const target = slot.hour * 60 + slot.minute;
  const window = resolveWindowMinutes(slot, cfg);
  const minutes = startMinutes ?? localMinutes(now, cfg.timezone);
  if (minutes < target) return false;
  return minutes < target + window;
}

/** Menit sejak tengah malam lokal (pola sama dengan scheduler.ts). */
function localMinutes(now: Date, timezone: string): number {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = fmt.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const hourRaw = Number.parseInt(get('hour'), 10);
  const hour = Number.isFinite(hourRaw) ? hourRaw % 24 : 0;
  const minute = Number.parseInt(get('minute'), 10) || 0;
  return hour * 60 + minute;
}

/**
 * Merge params slot ke global config. Field di slot bernilai NULL = warisi global.
 * Array (platform_slugs, notify_emails): NULL/kosong = warisi global (tidak bedakan).
 */
export function mergeSlotParams(global: AutomationConfig, slot: SlotRow): AutomationConfig {
  const pick = <T>(slotVal: T | null | undefined, globalVal: T): T =>
    slotVal != null ? slotVal : globalVal;
  return {
    id: global.id,
    isEnabled: slot.is_enabled !== false ? global.isEnabled : slot.is_enabled,
    scheduleHour: global.scheduleHour,
    scheduleMinute: global.scheduleMinute,
    timezone: global.timezone,
    scheduleWindowMinutes: global.scheduleWindowMinutes,
    mechanism: global.mechanism,
    platformSlugs: pick(slot.platform_slugs, global.platformSlugs),
    templateSlug: pick(slot.template_slug, global.templateSlug),
    maxTopics: pick(slot.max_topics, global.maxTopics),
    language: pick(slot.language, global.language),
    tone: pick(slot.tone, global.tone),
    audience: pick(slot.audience, global.audience),
    purpose: pick(slot.purpose, global.purpose),
    ctaStyle: pick(slot.cta_style, global.ctaStyle),
    targetReplyCount: pick(slot.target_reply_count, global.targetReplyCount),
    productPoolSize: pick(slot.product_pool_size, global.productPoolSize),
    productCategory: pick(slot.product_category, global.productCategory),
    ideaGenerationEnabled: pick(slot.idea_generation_enabled, global.ideaGenerationEnabled),
    ideaProductSearch: pick(slot.idea_product_search, global.ideaProductSearch),
    requireCover: pick(slot.require_cover, global.requireCover),
    coverMaxWaitMinutes: pick(slot.cover_max_wait_minutes, global.coverMaxWaitMinutes),
    coverMaxAttempts: pick(slot.cover_max_attempts, global.coverMaxAttempts),
    autoPublishArticle: pick(slot.auto_publish_article, global.autoPublishArticle),
    maxRetryAttempts: pick(slot.max_retry_attempts, global.maxRetryAttempts),
    notifyOn: (pick(slot.notify_on, global.notifyOn)) as AutomationConfig['notifyOn'],
    notifyEmails: pick(slot.notify_emails, global.notifyEmails),
    emailFrom: pick(slot.email_from, global.emailFrom),
    emailReplyTo: pick(slot.email_reply_to, global.emailReplyTo),
    maxIterations: pick(slot.maximum_iterations, global.maxIterations),
    minScore: pick(slot.minimum_score, global.minScore),
    minCandidates: pick(slot.minimum_candidates, global.minCandidates),
    freshnessHours: pick(slot.freshness_hours, global.freshnessHours)
  };
}

/** Muat semua slot enabled diurutkan priority/hour/minute. Fail-safe: return [] bila tabel belum ada. */
export async function loadEnabledSlots(
  supabase: SupabaseClient
): Promise<SlotRow[]> {
  try {
    const { data } = await supabase
      .from('automation_schedules')
      .select('*')
      .eq('is_enabled', true)
      .order('priority', { ascending: true })
      .order('hour', { ascending: true })
      .order('minute', { ascending: true });
    return (data ?? []) as SlotRow[];
  } catch {
    return [];
  }
}

/**
 * Backfill run-date lama ke slot 'default'. Opsional — bisa dipanggil sekali
 * setelah migrasi Fase 2 diterapkan agar semua run history punya slot_key.
 */
export async function backfillRunSlotKeys(supabase: SupabaseClient): Promise<{ updated: number }> {
  try {
    const { error } = await supabase
      .from('automation_runs')
      .update({ slot_key: 'default' })
      .is('slot_key', null)
      .neq('slot_key', 'default');
    if (error) return { updated: 0 };
    return { updated: 0 }; // Supabase select count via RPC tidak tersedia di semua versi; kembalikan 0.
  } catch {
    return { updated: 0 };
  }
}
