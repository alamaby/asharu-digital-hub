/**
 * Laporan run: URL post utama + URL tiap reply + delay aktual.
 *
 * Definisi "URL Threads" mengikuti validasi `markQueuePosted` di
 * `src/lib/social/actions.ts:213` — hanya `https://www.threads.com/...`.
 * File tersebut hanya dijadikan acuan, tidak diubah.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** @see src/lib/social/actions.ts:213 (markQueuePosted) — pola identik. */
export const THREADS_URL_RE = /^https:\/\/www\.threads\.com\//;

/** Nama file report: report-YYYYMMDD-HHmmss.json (waktu lokal). */
export const REPORT_NAME_RE = /^report-\d{8}-\d{6}\.json$/;

function localStamp(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}` +
    `${pad(date.getMonth() + 1)}` +
    `${pad(date.getDate())}-` +
    `${pad(date.getHours())}` +
    `${pad(date.getMinutes())}` +
    `${pad(date.getSeconds())}`
  );
}

/**
 * @param {string} url
 * @returns {boolean}
 */
export function isThreadsUrl(url) {
  return typeof url === 'string' && THREADS_URL_RE.test(url);
}

/**
 * @param {string} jobName
 * @param {{ action: { minSec: number, maxSec: number }, publish: { minSec: number, maxSec: number } }} effectiveDelays
 */
export function createReport(jobName, effectiveDelays) {
  return {
    job: jobName,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    dryRun: false,
    effectiveDelays,
    skipped: [],
    mainUrl: null,
    replies: [],
    actionDelaysSec: [],
    publishDelaysSec: [],
    failedAt: null
  };
}

/**
 * Catat URL: yang pertama = mainUrl, sisanya masuk `replies[]`.
 *
 * @param {ReturnType<typeof createReport>} report
 * @param {string} url
 */
export function recordPost(report, url) {
  if (!isThreadsUrl(url)) {
    throw new Error(`refusing to record non-threads URL: ${url}`);
  }
  if (report.mainUrl === null) report.mainUrl = url;
  else report.replies.push(url);
}

/**
 * Simpan report (nama file = timestamp lokal saat simpan).
 * `writeImpl` di-inject agar test deterministik.
 *
 * @param {ReturnType<typeof createReport>} report
 * @param {string} dir
 * @param {(path: string, data: string) => void} [writeImpl]
 * @returns {string} path file yang ditulis
 */
export function saveReport(report, dir, writeImpl = writeFileSync) {
  report.finishedAt = new Date().toISOString();
  const path = join(dir, `report-${localStamp(new Date())}.json`);
  writeImpl(path, `${JSON.stringify(report, null, 2)}\n`);
  return path;
}
