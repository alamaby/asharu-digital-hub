import { z } from 'zod';

/** Skema input form Studio — batas panjang mengikuti config (default 500). */
export function studioInputSchema(maxPromptLength: number) {
  return z.object({
    prompt: z
      .string()
      .trim()
      .min(10, 'Prompt minimal 10 karakter (EN, deskriptif).')
      .max(maxPromptLength, `Prompt maksimal ${maxPromptLength} karakter.`),
    negativePrompt: z
      .string()
      .trim()
      .max(500, 'Negative prompt maksimal 500 karakter.')
      .optional()
      .default(''),
    providerId: z.string().uuid('Provider tidak valid.').nullable().default(null),
    modelId: z.string().uuid('Model tidak valid.').nullable().default(null),
    styleSlug: z.string().trim().max(120).nullable().default(null),
    subjectSlug: z.string().trim().max(120).nullable().default(null),
    cameraSlug: z.string().trim().max(120).nullable().default(null),
    aspectSlug: z.string().trim().min(1, 'Pilih aspek rasio.')
  });
}

export type StudioInput = z.infer<ReturnType<typeof studioInputSchema>>;

/** Validasi silang provider↔model: bila keduanya dipilih, model harus milik provider. */
export function validateProviderModelLink(
  providerId: string | null,
  modelId: string | null,
  models: { id: string; provider_id: string }[]
): string | null {
  if (!providerId || !modelId) return null;
  const model = models.find((m) => m.id === modelId);
  if (!model) return 'Model tidak dikenal — refresh pilihan lalu coba lagi.';
  if (model.provider_id !== providerId) {
    return 'Model bukan milik provider terpilih — pilih ulang model atau provider.';
  }
  return null;
}

/** Hitung expires_at dari retention_days config (clamp 1–365). */
export function buildStudioExpiry(now: Date, retentionDays: number): string {
  const days = Math.min(365, Math.max(1, Math.floor(retentionDays) || 30));
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

/** Cek kuota harian: null limit = unlimited. */
export function checkStudioQuota(
  usedToday: number,
  dailyLimit: number | null
): { allowed: boolean; remaining: number | null } {
  if (dailyLimit === null || dailyLimit === undefined) return { allowed: true, remaining: null };
  return { allowed: usedToday < dailyLimit, remaining: Math.max(0, dailyLimit - usedToday) };
}

/** Pesan kuota yang jelas untuk UI (`role="status"`). */
export function quotaExceededMessage(limit: number): string {
  return `Kuota harian habis (${limit}/hari) — coba lagi besok. Histori 30 hari terakhir tetap bisa dilihat.`;
}
