import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ArticleLocale } from '@/lib/articles/types';

/** Baris `automation_configs` (singleton id=1) yang dipakai runner. */
export interface AutomationConfig {
  id: number;
  isEnabled: boolean;
  scheduleHour: number;
  scheduleMinute: number;
  timezone: string;
  scheduleWindowMinutes: number;
  mechanism: 'satu' | 'dua';
  platformSlugs: string[];
  templateSlug: string | null;
  maxTopics: number;
  language: string;
  tone: string;
  audience: string;
  purpose: string;
  ctaStyle: string;
  targetReplyCount: number | null;
  productPoolSize: number;
  productCategory: string | null;
  ideaGenerationEnabled: boolean;
  ideaProductSearch: boolean;
  requireCover: boolean;
  coverMaxWaitMinutes: number;
  coverMaxAttempts: number;
  autoPublishArticle: boolean;
  maxRetryAttempts: number;
  notifyOn: 'draft_ready' | 'published' | 'both' | 'none';
  notifyEmails: string[];
  emailFrom: string;
  emailReplyTo: string | null;
  /** Discovery knob (Fase 3): max iterasi discovery single-pass; default konservatif 1. */
  maxIterations: number;
  /** Minimum score kandidat (0–100); null = tidak ada batas. */
  minScore: number | null;
  /** Minimum kandidat yang lolos shortlist; null = warisi maxTopics. */
  minCandidates: number | null;
  /** Freshness hours: hanya produk dalam N jam terakhir; null = tak terbatas. */
  freshnessHours: number | null;
}

interface AutomationConfigRow {
  id: number;
  is_enabled: boolean;
  schedule_hour: number;
  schedule_minute: number;
  timezone: string;
  schedule_window_minutes: number;
  mechanism: string;
  platform_slugs: string[] | null;
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
  // Kolom ideation (migrasi 20260918_*; opsional agar baris pre-migrasi
  // tetap termuat — mapping default konservatif di bawah).
  idea_generation_enabled?: boolean | null;
  idea_product_search?: boolean | null;
  require_cover: boolean;
  cover_max_wait_minutes: number;
  cover_max_attempts: number;
  auto_publish_article: boolean;
  max_retry_attempts: number;
  notify_on: string;
  notify_emails: string[] | null;
  email_from: string;
  email_reply_to: string | null;
  // Kolom discovery (migrasi 20260920000003; opsional agar pre-migrasi termuat).
  maximum_iterations?: number | null;
  minimum_score?: number | null;
  minimum_candidates?: number | null;
  freshness_hours?: number | null;
}

const NOTIFY_VALUES = new Set(['draft_ready', 'published', 'both', 'none']);

export function mapConfigRow(row: AutomationConfigRow): AutomationConfig {
  const notifyOn = NOTIFY_VALUES.has(row.notify_on)
    ? (row.notify_on as AutomationConfig['notifyOn'])
    : 'none';
  return {
    id: row.id,
    isEnabled: row.is_enabled,
    scheduleHour: row.schedule_hour,
    scheduleMinute: row.schedule_minute,
    timezone: row.timezone,
    scheduleWindowMinutes: row.schedule_window_minutes,
    mechanism: row.mechanism === 'satu' ? 'satu' : 'dua',
    platformSlugs: row.platform_slugs ?? [],
    templateSlug: row.template_slug,
    maxTopics: row.max_topics,
    language: row.language,
    tone: row.tone,
    audience: row.audience,
    purpose: row.purpose,
    ctaStyle: row.cta_style,
    targetReplyCount: row.target_reply_count,
    productPoolSize: row.product_pool_size,
    productCategory: row.product_category,
    // Kolom ideation (migrasi 20260918): baris lama tanpa kolom → default
    // konservatif (mati) agar perilaku existing tak berubah diam-diam.
    ideaGenerationEnabled: row.idea_generation_enabled ?? false,
    ideaProductSearch: row.idea_product_search ?? true,
    requireCover: row.require_cover,
    coverMaxWaitMinutes: row.cover_max_wait_minutes,
    coverMaxAttempts: row.cover_max_attempts,
    autoPublishArticle: row.auto_publish_article,
    maxRetryAttempts: row.max_retry_attempts,
    notifyOn,
    notifyEmails: row.notify_emails ?? [],
    emailFrom: row.email_from,
    emailReplyTo: row.email_reply_to,
    // Discovery knob (Fase 3): default konservatif 1 agar perilaku lama tak berubah.
    maxIterations: row.maximum_iterations ?? 1,
    minScore: row.minimum_score ?? null,
    minCandidates: row.minimum_candidates ?? null,
    freshnessHours: row.freshness_hours ?? null
  };
}

/** Muat config singleton; null bila baris/tabel belum ada (fail-safe: no-op). */
export async function loadAutomationConfig(
  supabase: SupabaseClient
): Promise<AutomationConfig | null> {
  const { data, error } = await supabase
    .from('automation_configs')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (error || !data) return null;
  return mapConfigRow(data as AutomationConfigRow);
}

/** Bahasa publish dari `language` sesi/config (null & both → id+en). */
export function resolveRunLocales(language: string | null): ArticleLocale[] {
  if (language === 'en') return ['en'];
  if (language === 'id') return ['id'];
  return ['id', 'en'];
}

/**
 * Penerima email: `notify_emails` config bila ada; jika kosong fallback ke
 * seluruh `profiles.email` yang `is_admin = true`. Di-dedupe + lowercase.
 * Tidak pernah melempar: kegagalan query diperlakukan sebagai tanpa penerima
 * (email di-skip) agar tidak menghentikan tick automation.
 */
export async function resolveRecipients(
  supabase: SupabaseClient,
  cfg: AutomationConfig
): Promise<string[]> {
  try {
    const configured = cfg.notifyEmails.map((e) => e.trim()).filter(Boolean);
    if (configured.length > 0) return [...new Set(configured)];
    const { data } = await supabase.from('profiles').select('email').eq('is_admin', true);
    const emails = ((data ?? []) as { email: string | null }[])
      .map((r) => r.email?.trim() ?? '')
      .filter(Boolean);
    return [...new Set(emails)];
  } catch {
    return [];
  }
}
