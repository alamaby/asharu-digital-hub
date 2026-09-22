import 'server-only';
// ⚠️ DILARANG mengimpor reportError dari error-events.ts — akan menyebabkan loop rekursif
//    bila pengiriman digest gagal dan digest mencoba melaporkan gagalnya sendiri.
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadAutomationConfig, resolveRecipients, type AutomationConfig } from '@/lib/automation/config';
import { sendErrorDigestEmail, type ErrorDigestGroup } from '@/lib/automation/email';
import { env } from '@/lib/env';

export interface DueCategory {
  category: string;
  windowMinutes: number;
  notifyEmails: string[] | null;
}

export interface DigestEventRow {
  id: string;
  category: string;
  fingerprint: string;
  message: string;
  source: string;
  severity: string;
  created_at: string;
}

/**
 * Kelompokkan baris event berdasarkan (category, fingerprint), hitung jumlah,
 * ambil sample pesan pertama (maks 160 char). Potong per kategori ke maxGroupsPerCategory.
 */
export function groupEvents(
  rows: DigestEventRow[],
  maxGroupsPerCategory = 10
): ErrorDigestGroup[] {
  const grouped = new Map<string, Map<string, { count: number; sample: string }>>();
  const categoryOrder: string[] = [];

  for (const row of rows) {
    if (!grouped.has(row.category)) {
      grouped.set(row.category, new Map());
      categoryOrder.push(row.category);
    }
    const fm = grouped.get(row.category)!;
    const existing = fm.get(row.fingerprint);
    if (existing) {
      existing.count += 1;
    } else {
      fm.set(row.fingerprint, { count: 1, sample: row.message.slice(0, 160) });
    }
  }

  const result: ErrorDigestGroup[] = [];
  for (const cat of categoryOrder) {
    const fm = grouped.get(cat)!;
    const entries = [...fm.entries()]
      .map(([fingerprint, v]) => ({ fingerprint, count: v.count, sample: v.sample }))
      .sort((a, b) => b.count - a.count)
      .slice(0, maxGroupsPerCategory);
    const total = entries.reduce((sum, e) => sum + e.count, 0);
    result.push({ category: cat, count: total, topMessages: entries });
  }
  return result;
}

interface ConfigRow {
  category: string;
  is_enabled: boolean;
  digest_window_minutes: number;
  notify_emails: string[] | null;
  last_digest_at: string | null;
}

interface EventRow {
  id: string;
  category: string;
  fingerprint: string;
  message: string;
  source: string;
  severity: string;
  created_at: string;
}

/**
 * Tick digest: pilih kategori jatuh-tempo, ambil event, grouping, kirim 1 email,
 * tandai notified (claim-first agar idempoten). Never throws.
 */
export async function runErrorDigestTick(
  supabase: SupabaseClient,
  deps?: {
    now?: Date;
    send?: typeof sendErrorDigestEmail;
    siteUrl?: string;
  }
): Promise<{ sent: boolean; categories: string[]; eventCount: number }> {
  try {
    const now = deps?.now ?? new Date();

    // 1. Muat konfigurasi
    const { data: configRows, error: configError } = await supabase
      .from('error_notification_configs')
      .select('category, is_enabled, digest_window_minutes, notify_emails, last_digest_at');
    if (configError || !configRows || configRows.length === 0) {
      return { sent: false, categories: [], eventCount: 0 };
    }

    // 2. Muat global automation config
    const globalCfg = await loadAutomationConfig(supabase);
    const resolvedCfg: AutomationConfig = globalCfg ?? {
      id: 1,
      isEnabled: false,
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
      requireCover: true,
      coverMaxWaitMinutes: 60,
      coverMaxAttempts: 3,
      autoPublishArticle: true,
      maxRetryAttempts: 3,
      notifyOn: 'none',
      notifyEmails: [],
      emailFrom: 'Asharu <notifikasi@asharu.id>',
      productBlackoutDays: 14,
      emailReplyTo: null,
      maxIterations: 1,
      minScore: null,
      minCandidates: null,
      freshnessHours: null
    } as AutomationConfig;

    // 3. Filter kategori due
    const dueCats: DueCategory[] = [];
    for (const row of configRows as ConfigRow[]) {
      if (!row.is_enabled) continue;
      const windowMs = row.digest_window_minutes * 60_000;
      const lastDigest = row.last_digest_at ? new Date(row.last_digest_at).getTime() : 0;
      if (now.getTime() - lastDigest >= windowMs) {
        dueCats.push({
          category: row.category,
          windowMinutes: row.digest_window_minutes,
          notifyEmails: row.notify_emails
        });
      }
    }

    if (dueCats.length === 0) {
      return { sent: false, categories: [], eventCount: 0 };
    }

    // 4. Ambil events unnotified
    const categories = dueCats.map((c) => c.category);
    const { data: eventRows, error: eventError } = await supabase
      .from('error_events')
      .select('id, category, fingerprint, message, source, severity, created_at')
      .is('notified_at', null)
      .in('category', categories)
      .order('created_at')
      .limit(500);

    if (eventError || !eventRows || eventRows.length === 0) {
      return { sent: false, categories: [], eventCount: 0 };
    }

    // 5. Resolve recipients (global dedupe)
    const allRecipients = new Set<string>();
    for (const dc of dueCats) {
      if (dc.notifyEmails && dc.notifyEmails.length > 0) {
        for (const e of dc.notifyEmails) {
          const trimmed = e.trim().toLowerCase();
          if (trimmed) allRecipients.add(trimmed);
        }
      }
    }
    if (allRecipients.size === 0) {
      let globalRecipients: string[] = [];
      try {
        globalRecipients = await resolveRecipients(supabase, resolvedCfg);
      } catch { /* ignore */ }
      for (const e of globalRecipients) allRecipients.add(e.toLowerCase());
    }
    const recipients = [...allRecipients];

    if (recipients.length === 0) {
      // Tulis log skipped tapi jangan tandai notified / maju last_digest_at
      try {
        await supabase.from('automation_email_log').insert({
          moment: 'error_digest',
          recipients: [],
          ok: false,
          skipped: true,
          resend_id: null,
          error: 'no recipients'
        } as unknown as Record<string, unknown>);
      } catch { /* best-effort */ }
      return { sent: false, categories: [], eventCount: 0 };
    }

    // 6. Claim-first: update last_digest_at untuk semua kategori due SEBELUM kirim
    const nowIso = now.toISOString();
    try {
      await supabase
        .from('error_notification_configs')
        .update({ last_digest_at: nowIso })
        .in('category', categories);
    } catch { /* non-blocking */ }

    // 7. Group events & kirim digest
    const groups = groupEvents(eventRows as EventRow[]);
    const totalEvents = groups.reduce((sum, g) => sum + g.count, 0);
    const siteUrl = deps?.siteUrl ?? env.siteUrl;
    const sendFn = deps?.send ?? sendErrorDigestEmail;
    const res = await sendFn(supabase, resolvedCfg, {
      recipients,
      windowMinutes: dueCats[0]!.windowMinutes,
      groups,
      totalEvents,
      siteUrl
    });

    // 8. Tandai notified bila sukses
    if (res.ok) {
      const ids = [...new Set((eventRows as EventRow[]).map((r) => r.id))];
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        await supabase
          .from('error_events')
          .update({ notified_at: nowIso })
          .in('id', chunk);
      }
    }

    return { sent: res.ok, categories, eventCount: totalEvents };
  } catch {
    return { sent: false, categories: [], eventCount: 0 };
  }
}
