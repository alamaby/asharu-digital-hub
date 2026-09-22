'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { isAdmin } from '@/lib/auth/is-admin';
import { createSupabaseService } from '@/lib/supabase/server';
import type { AutomationActionResult } from '@/lib/automation/actions';

const ERROR_CATEGORIES = ['tavily', 'llm', 'research', 'automation', 'scrape', 'cron_api', 'resend', 'image'] as const;
type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

export async function updateErrorNotificationConfig(formData: FormData): Promise<AutomationActionResult> {
  try {
    if (!(await isAdmin())) return { ok: false, error: 'Unauthorized: admin only' };
    const supabase = createSupabaseService();
    if (!supabase) return { ok: false, error: 'Supabase not configured' };

    const rawCategory = String(formData.get('category') ?? '').trim();
    if (!ERROR_CATEGORIES.includes(rawCategory as ErrorCategory)) {
      return { ok: false, error: 'kategori tidak dikenal' };
    }

    const isEnabled = formData.get('is_enabled') === 'on' || formData.get('is_enabled') === 'true';
    const windowRaw = Number(formData.get('digest_window_minutes'));
    if (!Number.isFinite(windowRaw) || windowRaw < 5 || windowRaw > 1440) {
      return { ok: false, error: 'window_minutes harus 5–1440' };
    }

    // Parse notify_emails: split by comma/newline, trim, validate each
    const emailsRaw = String(formData.get('notify_emails') ?? '').trim();
    let notifyEmails: string[] | null = null;
    if (emailsRaw.length > 0) {
      const parsed = emailsRaw
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const validation = z.array(z.string().email()).safeParse(parsed);
      if (!validation.success) {
        const firstError = validation.error.issues[0]?.message ?? 'format email salah';
        return { ok: false, error: `email tidak valid: ${firstError}` };
      }
      notifyEmails = parsed.length > 0 ? parsed : null;
    }

    const { error } = await supabase
      .from('error_notification_configs')
      .update({
        is_enabled: isEnabled,
        digest_window_minutes: windowRaw,
        notify_emails: notifyEmails,
        updated_at: new Date().toISOString()
      })
      .eq('category', rawCategory);

    if (error) return { ok: false, error: error.message };
    revalidatePath('/admin/automation');
    return { ok: true, message: `Konfigurasi ${rawCategory} tersimpan.` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
