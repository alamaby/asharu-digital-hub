import { z } from 'zod';

const uuid = z.string().uuid('ID tidak valid.');

/** Skema submit Chat Lab — batas mengikuti config (default 4000/2000). */
export function labInputSchema(maxTargets = 3) {
  return z.object({
    systemPrompt: z
      .string()
      .trim()
      .max(2000, 'System prompt maksimal 2000 karakter.')
      .nullable()
      .default(null),
    userPrompt: z
      .string()
      .trim()
      .min(10, 'Prompt minimal 10 karakter.')
      .max(4000, 'Prompt maksimal 4000 karakter.'),
    temperature: z
      .number({ invalid_type_error: 'Temperature harus angka 0–2.' })
      .min(0, 'Temperature minimal 0.')
      .max(2, 'Temperature maksimal 2.')
      .nullable()
      .default(null),
    maxTokens: z
      .number({ invalid_type_error: 'Max tokens harus angka.' })
      .int('Max tokens harus bilangan bulat.')
      .min(1, 'Max tokens minimal 1.')
      .max(8000, 'Max tokens maksimal 8000.')
      .nullable()
      .default(null),
    targets: z
      .array(
        z.object({
          providerId: uuid,
          modelId: uuid
        })
      )
      .min(1, 'Pilih minimal 1 target model.')
      .max(maxTargets, `Maksimal ${maxTargets} target per submit.`)
  });
}

export type LabInput = z.infer<ReturnType<typeof labInputSchema>>;

/** Expiry batch/run = sekarang + retention hari (murni, bukan server action). */
export function buildLabExpiry(from: Date, retentionDays: number): string {
  return new Date(from.getTime() + retentionDays * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Validasi silang provider↔model: model harus milik provider yang dipilih.
 * Cegah pin silang (model provider A + provider B) yang membuat perbandingan bias.
 */
export function validateLabTargetLink(
  providerId: string,
  modelId: string,
  models: { id: string; provider_id: string }[]
): string | null {
  const model = models.find((m) => m.id === modelId);
  if (!model) return 'Model tidak dikenal — refresh pilihan lalu coba lagi.';
  if (model.provider_id !== providerId) {
    return 'Model bukan milik provider yang dipilih — perbaiki pasangan provider/model.';
  }
  return null;
}
