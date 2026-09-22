export const RUN_PAGE_SIZE = 10;

export type RunStatusFilter = 'all' | 'active' | 'completed' | 'failed';

const VALID_RUN_FILTERS = new Set<RunStatusFilter>(['all', 'active', 'completed', 'failed']);

export function parseRunStatusFilter(v: unknown): RunStatusFilter {
  return VALID_RUN_FILTERS.has(v as RunStatusFilter) ? (v as RunStatusFilter) : 'all';
}

/** Status yang dianggap "masih berjalan" untuk filter `active`. */
export const ACTIVE_RUN_STATUSES = ['session_created', 'developing', 'awaiting_cover', 'publishing', 'published', 'notifying'] as const;

export interface RunTopicRow {
  session_id: string;
  topic: string | null;
  rank: number | null;
  status: string | null;
}

/**
 * Pilih topik utama dari kandidat per sesi.
 * - Bila ada topik berstatus `shortlisted`, ambil yang rank terkecil.
 * - Bila tidak, ambil rank terkecil dari semua topik.
 * - Kosong → null.
 */
export function pickPrimaryTopic(rows: RunTopicRow[], sessionId: string | null): string | null {
  if (!sessionId) return null;
  const candidates = rows.filter((r) => r.session_id === sessionId);
  if (candidates.length === 0) return null;
  const shortlisted = candidates.filter((r) => r.status === 'shortlisted');
  const pool = shortlisted.length > 0 ? shortlisted : candidates;
  const winner = pool.reduce<(typeof pool)[number]>((best, cur) => {
    const bestRank = best.rank ?? 999;
    const curRank = cur.rank ?? 999;
    return curRank < bestRank ? cur : best;
  }, pool[0]!);
  return winner.topic ?? null;
}

/**
 * Format durasi antara dua ISO timestamp menjadi string ringkas.
 * - invalid /负 → '—'
 * - <60 menit → 'N mnt'
 * - ≥60 menit → 'H j MM mnt' (menit 2 digit)
 */
export function formatRunDuration(startIso: string | null, endIso: string | null): string {
  const start = startIso ? new Date(startIso).getTime() : NaN;
  const end = endIso ? new Date(endIso).getTime() : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '—';
  const diff = end - start;
  if (diff < 0) return '—';
  const totalMnt = Math.floor(diff / 60000);
  if (totalMnt < 60) return `${totalMnt} mnt`;
  const h = Math.floor(totalMnt / 60);
  const m = totalMnt % 60;
  return `${h} j ${String(m).padStart(2, '0')} mnt`;
}
