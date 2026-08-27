// Structured content for the Asharu Math homepage promotion.
import { z } from 'zod';
import type { LocalizedText } from './schemas';

const httpsUrl = z.string().url().refine((value) => value.startsWith('https://'));

export const mathAppConfig = {
  name: { id: 'Asharu Math', en: 'Asharu Math' } as LocalizedText,
  tagline: {
    id: 'Belajar Matematika Kelas 2 SD',
    en: 'Grade 2 Math Learning'
  } as LocalizedText,
  title: {
    id: 'Belajar Matematika Kelas 2 SD — Penjumlahan & Pengurangan Bersusun',
    en: 'Grade 2 Math — Column Addition & Subtraction'
  } as LocalizedText,
  description: {
    id: 'Bantu anak kelas 2 SD menguasai penjumlahan dan pengurangan bersusun pendek dengan langkah interaktif, 11 level bertahap, tampilan susun angka yang akurat, serta PWA offline — tanpa data pribadi anak.',
    en: 'Help Grade 2 kids master column addition and subtraction with step-by-step learning, 11 progressive levels, accurate vertical number layouts, and offline PWA — with no child personal data collected.'
  } as LocalizedText,
  bulletPoints: [
    {
      id: 'Mode Belajar bertahap bersama maskot Asya (carry & borrow)',
      en: 'Step-by-step Learn mode with mascot Asya (carry & borrow)'
    },
    {
      id: '11 level bertahap + Level Tantangan adaptif',
      en: '11 progressive levels + adaptive Challenge level'
    },
    { id: 'Bisa dipasang sebagai aplikasi & berjalan offline', en: 'Installable as an app and works offline' }
  ] as LocalizedText[],
  url: 'https://math.asharu.id',
  cta: { id: 'Mulai Belajar', en: 'Start Learning' } as LocalizedText
} as const;

export function assertMathAppUrl(value: string): string {
  return httpsUrl.parse(value);
}
