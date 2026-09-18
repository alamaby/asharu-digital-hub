/**
 * Helpers murni untuk halaman monitor pg_cron. Tidak mengakses DB.
 */

/** Format durasi ms → string human-readable (detik atau menit). */
export function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null || ms < 0) return '—';
  if (ms < 1000) return `${ms} ms`;
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec} s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem > 0 ? `${min} m ${rem} d` : `${min} m`;
}

/** Warna badge status cron (hanya map literal — tidak ada logika DB). */
export type CronStatusTone = 'success' | 'error' | 'warning' | 'neutral';
const TONE_MAP: Record<string, CronStatusTone> = {
  succeeded: 'success',
  failed: 'error',
  running: 'warning',
  starting: 'warning'
};
export function cronStatusTone(status: string): CronStatusTone {
  return TONE_MAP[status] ?? 'neutral';
}

/** Potong body respons agar <pre> tidak raksasa; tetap utuh jika <= max. */
export function truncateBody(body: string | null | undefined, max = 400): string {
  if (!body) return '';
  if (body.length <= max) return body;
  return `${body.slice(0, max)}…`;
}

/** Coba parse body sebagai JSON tersastra; fallback string mentah. */
export function prettyJson(value: unknown): string {
  if (value == null) return '';
  try {
    if (typeof value === 'string') {
      try {
        return JSON.stringify(JSON.parse(value), null, 2);
      } catch {
        return value;
      }
    }
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
