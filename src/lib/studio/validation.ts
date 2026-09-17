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
    aspectSlug: z.string().trim().min(1, 'Pilih aspek rasio.'),
    /** Advanced opsional (diekspos di form): guidance 0–10, steps 1–50, seed ≥0, dimensi 256–2500. */
    guidance: z
      .number({ invalid_type_error: 'Guidance harus angka 0–10.' })
      .min(0, 'Guidance minimal 0.')
      .max(10, 'Guidance maksimal 10.')
      .nullable()
      .default(null),
    steps: z
      .number({ invalid_type_error: 'Steps harus angka 1–50.' })
      .int('Steps harus bilangan bulat.')
      .min(1, 'Steps minimal 1.')
      .max(50, 'Steps maksimal 50.')
      .nullable()
      .default(null),
    seed: z
      .number({ invalid_type_error: 'Seed harus angka ≥0.' })
      .int('Seed harus bilangan bulat.')
      .min(0, 'Seed minimal 0.')
      .nullable()
      .default(null),
    reqWidth: z
      .number({ invalid_type_error: 'Lebar harus angka 256–2500.' })
      .int('Lebar harus bilangan bulat.')
      .min(256, 'Lebar minimal 256.')
      .max(2500, 'Lebar maksimal 2500.')
      .nullable()
      .default(null),
    reqHeight: z
      .number({ invalid_type_error: 'Tinggi harus angka 256–2500.' })
      .int('Tinggi harus bilangan bulat.')
      .min(256, 'Tinggi minimal 256.')
      .max(2500, 'Tinggi maksimal 2500.')
      .nullable()
      .default(null),
    /** Strength img2img 0–1 opsional; hanya bermakna bila referensi diisi. */
    referenceStrength: z
      .number({ invalid_type_error: 'Strength harus angka 0–1.' })
      .min(0, 'Strength minimal 0.')
      .max(1, 'Strength maksimal 1.')
      .nullable()
      .default(null),
    /** Public URL referensi (upload baru atau histori milik user). */
    referencePublicUrl: z.string().trim().max(2048).nullable().default(null)
  });
}

/**
 * Validasi silang referensi↔model: bila referensi diisi dan user mem-pin
 * model yang tidak support → tolak cepat dengan pesan jelas (R3). Bila
 * Auto (modelId null), worker mempersempit waterfall ke model support.
 */
export function validateReferenceModelLink(
  referencePublicUrl: string | null,
  modelId: string | null,
  models: { id: string; supports_reference: boolean; display_name: string }[]
): string | null {
  if (!referencePublicUrl || !modelId) return null;
  const model = models.find((m) => m.id === modelId);
  if (!model) return 'Model tidak dikenal — refresh pilihan lalu coba lagi.';
  if (!model.supports_reference) {
    return `Model ${model.display_name} tidak mendukung image reference — pilih model reference (SD img2img / FLUX.2) atau Auto.`;
  }
  return null;
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
