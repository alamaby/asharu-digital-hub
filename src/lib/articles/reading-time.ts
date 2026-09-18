/**
 * Perkiraan waktu baca berdasarkan jumlah kata di body_md (rata-rata 200 kata/menit).
 * Fungsi murni — dipakai server-side agar halaman list tetap statis (SSG/ISR).
 */
export function estimateReadingMinutes(bodyMd: string): number {
  const words = bodyMd.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}
