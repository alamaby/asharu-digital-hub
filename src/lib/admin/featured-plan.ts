/**
 * Logika kurasi featured admin — TIDAK bergantung Supabase/Next, bisa diuji unit.
 *
 * Skema rank (kolom generated `featured_rank`):
 *   0 = admin-pin (`featured_override=true`)
 *   1 = scraper-default (`featured_override=NULL AND is_featured=true`)
 *   2 = non-featured / dikecualikan (`featured_override IS FALSE` atau sisa)
 *
 * Aturan bisnis (sesuai plan 2026-09-16):
 * - Auto-swap: saat mem-pin melebihi MAX_CURATED, produk pin tertua dilepas (ke auto).
 * - "Tertua" = `featured_override_at` paling lama; NULL = belum ada, dianggap baru.
 * - Action auto/exclude tidak memicu swap (hanya mengubah target).
 */

export type OverrideMode = 'pin' | 'auto' | 'exclude';

export interface OverrideRow {
  id: string;
  friendly_code: string;
  featured_override: boolean | null;
  /** ISO8601 atau null. Null = belum pernah dikurasi → paling muda. */
  featured_override_at: string | null;
}

export interface FeaturedPlanResult {
  setTarget: { id: string; override: boolean | null; at: string | null };
  release: { id: string; friendly_code: string } | null;
}

export const MAX_CURATED = 6;

/**
 * Hitung rencana tindakan berdasarkan daftar pinned existing.
 * `now` = string ISO yang diberikan pemanggil (agar deterministik di test).
 */
export function planFeaturedOverride(
  pinned: OverrideRow[],
  targetId: string,
  mode: OverrideMode,
  now: string
): FeaturedPlanResult {
  if (mode === 'auto') {
    return { setTarget: { id: targetId, override: null, at: null }, release: null };
  }
  if (mode === 'exclude') {
    return { setTarget: { id: targetId, override: false, at: null }, release: null };
  }

  // mode === 'pin':
  const currentPinned = pinned.filter((r) => r.featured_override === true);
  const alreadyPinned = currentPinned.find((r) => r.id === targetId);

  if (alreadyPinned) {
    // Sudah pin → no-op aman (pertahankan at lama).
    return { setTarget: { id: targetId, override: true, at: alreadyPinned.featured_override_at }, release: null };
  }

  if (currentPinned.length >= MAX_CURATED) {
    // Perlu swap: lepas pin tertua (OLDEST = at ASC, NULL = paling baru).
    const sorted = [...currentPinned].sort((a, b) => {
      // NULL at = belum dikurasi = paling muda → di akhir.
      if (!a.featured_override_at && !b.featured_override_at) {
        // Sama-sama null → tie-break id ASC (paling kecil dilepas duluan).
        return a.id.localeCompare(b.id);
      }
      if (!a.featured_override_at) return 1;
      if (!b.featured_override_at) return -1;
      // Keduanya punya at → bandingkan timestamp ASC (oldest first).
      const cmp = a.featured_override_at.localeCompare(b.featured_override_at);
      if (cmp !== 0) return cmp;
      // Timestamp sama → tie-break id ASC.
      return a.id.localeCompare(b.id);
    });
    const toRelease = sorted[0]!;
    return {
      setTarget: { id: targetId, override: true, at: now },
      release: { id: toRelease.id, friendly_code: toRelease.friendly_code }
    };
  }

  return { setTarget: { id: targetId, override: true, at: now }, release: null };
}
