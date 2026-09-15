/**
 * Pure scheduling helpers untuk automation harian.
 *
 * Semua perhitungan waktu memakai Intl dengan timeZone config (bukan offset
 * hardcoded) supaya DST/perubahan kebijakan zona tetap benar. Tidak ada import
 * Supabase / server-only agar mudah diunit-test.
 */

export interface ScheduleConfig {
  scheduleHour: number;
  scheduleMinute: number;
  timezone: string;
  scheduleWindowMinutes: number;
}

export interface LocalParts {
  /** YYYY-MM-DD pada zona waktu config. */
  date: string;
  hour: number;
  minute: number;
  /** Menit sejak tengah malam lokal (hour*60 + minute). */
  minutes: number;
}

function assertValidTimeZone(timeZone: string): void {
  // Intl melempar RangeError untuk timezone tak dikenal — gagalkan cepat
  // dengan pesan yang jelas, bukan crash di tengah tick cron.
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
  } catch {
    throw new Error(`automation: timezone tidak valid: "${timeZone}"`);
  }
}

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = partsFormatterCache.get(timeZone);
  if (cached) return cached;
  assertValidTimeZone(timeZone);
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  partsFormatterCache.set(timeZone, fmt);
  return fmt;
}

/**
 * Pecah sebuah instant menjadi komponen waktu lokal pada `timezone`.
 * `hour` 24 jam ("24" dari beberapa ICU dinormalkan ke 0).
 */
export function localParts(now: Date, timezone: string): LocalParts {
  const fmt = formatterFor(timezone);
  const parts = fmt.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const year = get('year');
  const month = get('month');
  const day = get('day');
  const hourRaw = Number.parseInt(get('hour'), 10);
  const hour = Number.isFinite(hourRaw) ? hourRaw % 24 : 0;
  const minute = Number.parseInt(get('minute'), 10) || 0;
  return {
    date: `${year}-${month}-${day}`,
    hour,
    minute,
    minutes: hour * 60 + minute
  };
}

/** Tanggal lokal (YYYY-MM-DD) pada zona waktu config. */
export function localDateString(now: Date, timezone: string): string {
  return localParts(now, timezone).date;
}

/** Menit sejak tengah malam lokal. */
export function localMinutes(now: Date, timezone: string): number {
  return localParts(now, timezone).minutes;
}

/**
 * True bila `now` berada di jendela [target, target + window) waktu lokal.
 * `startMinutes` opsional untuk test deterministik (menggantikan konversi TZ).
 */
export function isRunDue(cfg: ScheduleConfig, now: Date, startMinutes?: number): boolean {
  const target = cfg.scheduleHour * 60 + cfg.scheduleMinute;
  const minutes = startMinutes ?? localMinutes(now, cfg.timezone);
  if (minutes < target) return false;
  return minutes < target + cfg.scheduleWindowMinutes;
}

/**
 * Pilih acak 1 elemen; `rng` menerima jumlah kandidat dan mengembalikan indeks
 * [0, n). Default memakai Web Crypto `getRandomValues` (bukan Math.random)
 * supaya pilihan produk tidak mudah diprediksi/di-seed.
 */
export function pickRandomIndex(length: number, rng?: (n: number) => number): number {
  if (length <= 0) throw new Error('pickRandomIndex: kandidat kosong');
  if (length === 1) return 0;
  if (rng) {
    const idx = rng(length);
    return ((idx % length) + length) % length;
  }
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] ?? 0) % length;
}

export function pickRandomProduct<T>(rows: T[], rng?: (n: number) => number): T | null {
  if (rows.length === 0) return null;
  return rows[pickRandomIndex(rows.length, rng)] ?? null;
}
