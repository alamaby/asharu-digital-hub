import { z } from 'zod';

/** Pilot-interest / waitlist validation — shared client + server. */

export const BUSINESS_CATEGORIES = [
  'kuliner',
  'produk_rumahan',
  'jasa_lokal',
  'kreatif',
  'profesional_mandiri',
  'properti',
  'online_shop',
  'lainnya'
] as const;

export const PRIMARY_CHANNELS = [
  'instagram',
  'tiktok',
  'facebook',
  'whatsapp',
  'threads',
  'shopee',
  'lainnya'
] as const;

export const pilotInterestSchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter.').max(80),
  businessName: z.string().trim().min(2, 'Nama usaha minimal 2 karakter.').max(120),
  category: z.enum(BUSINESS_CATEGORIES, { errorMap: () => ({ message: 'Pilih kategori usaha.' }) }),
  channel: z.enum(PRIMARY_CHANNELS, { errorMap: () => ({ message: 'Pilih kanal utama.' }) }),
  challenge: z.string().trim().min(10, 'Ceritakan kendala minimal 10 karakter.').max(500),
  contact: z
    .string()
    .trim()
    .min(5, 'Isi email atau nomor WhatsApp yang bisa dihubungi.')
    .max(120)
    .refine(
      (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || /^\+?[0-9][0-9\s\-()]{5,}$/.test(v),
      'Isi email valid atau nomor WhatsApp.'
    ),
  consent: z.literal(true, { errorMap: () => ({ message: 'Centang persetujuan untuk lanjut.' }) }),
  /** Honeypot — must stay empty. */
  website: z.string().max(0, 'Spam terdeteksi.').optional().default('')
});

export type PilotInterest = z.infer<typeof pilotInterestSchema>;

export function validatePilotInterest(input: unknown) {
  return pilotInterestSchema.safeParse(input);
}
