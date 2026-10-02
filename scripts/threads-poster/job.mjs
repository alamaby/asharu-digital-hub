/**
 * Parse + validasi job JSON dan merge konfigurasi delay.
 *
 * Prioritas merge (per knob `action` / `publish`, selalu utuh — tidak pernah
 * mix parsial): CLI > job JSON > default produksi (`delays.mjs`).
 *
 * Semua pesan error di file ini bersifat API publik — unit test mengunci
 * bentuknya persis agar pesan di terminal tidak berubah diam-diam.
 */
import { readFileSync } from 'node:fs';

/** Batas panjang teks satu post Threads (dokumentasi Threads API). */
export const MAX_TEXT = 500;

const DELAY_KEYS = ['action', 'publish'];

/**
 * @typedef {{ minSec: number, maxSec: number }} DelayBounds
 * @typedef {{ action: DelayBounds, publish: DelayBounds }} EffectiveDelays
 * @typedef {{ text: string, image?: string | null, location?: string | null,
 *            topic?: string | null }} JobReply
 * @typedef {{ text: string, image?: string | null, location?: string | null,
 *            topic?: string | null, delays?: { action?: DelayBounds, publish?: DelayBounds },
 *            replies?: JobReply[] }} Job
 */

function boundsProblem(label, value) {
  if (!value || typeof value !== 'object') return `${label} must be { minSec, maxSec }`;
  const { minSec, maxSec } = value;
  for (const [name, bound] of [
    ['minSec', minSec],
    ['maxSec', maxSec]
  ]) {
    if (!Number.isInteger(bound) || bound < 0) {
      return `${label} must be non-negative integers (${name}=${String(bound)})`;
    }
  }
  if (minSec > maxSec) {
    return `${label} minSec (${minSec}) must be <= maxSec (${maxSec})`;
  }
  return null;
}

/**
 * Baca + parse file job JSON.
 *
 * @param {string} path
 * @param {(path: string) => string} [readImpl]
 * @returns {Job}
 */
export function parseJobFile(path, readImpl = readFileSync) {
  let raw;
  try {
    raw = readImpl(path, 'utf8');
  } catch {
    throw new Error(`job file ${path} not found`);
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`job file ${path} is not valid JSON`);
  }
}

/**
 * Parse flag delay CLI: format PASTI "min,max" dalam detik (mis. "4,12").
 *
 * @param {string} value
 * @param {string} name mis. "action" → dipakai untuk `--action-delay`
 * @returns {DelayBounds}
 */
export function parseDelayFlag(value, name) {
  const parts = String(value)
    .split(',')
    .map((p) => p.trim());
  const minSec = Number(parts[0]);
  const maxSec = Number(parts[1]);
  if (parts.length !== 2 || !Number.isInteger(minSec) || !Number.isInteger(maxSec)) {
    throw new Error(`invalid --${name}-delay "${value}", expected "min,max" in seconds`);
  }
  return { minSec, maxSec };
}

/**
 * Merge delay: CLI menang utuh, lalu job, lalu default produksi.
 *
 * @param {{ action?: DelayBounds, publish?: DelayBounds }} [jobDelays]
 * @param {{ action?: DelayBounds, publish?: DelayBounds }} [cliDelays]
 * @param {{ action?: DelayBounds, publish?: DelayBounds }} [defaults]
 * @returns {EffectiveDelays}
 */
export function mergeDelays(jobDelays = {}, cliDelays = {}, defaults) {
  const fallback = defaults ?? {
    action: { minSec: 4, maxSec: 12 },
    publish: { minSec: 300, maxSec: 600 }
  };
  /** @type {EffectiveDelays} */
  const merged = { action: { ...fallback.action }, publish: { ...fallback.publish } };
  for (const key of DELAY_KEYS) {
    const fromCli = cliDelays[key];
    if (fromCli) merged[key] = { ...fromCli };
    else if (jobDelays[key]) merged[key] = { ...jobDelays[key] };
  }
  return merged;
}

function validatePost(label, post) {
  const errors = [];
  if (!post || typeof post !== 'object') {
    errors.push(`${label} must be an object`);
    return errors;
  }
  if (typeof post.text !== 'string' || post.text.trim().length === 0) {
    errors.push(`${label}.text must be a non-empty string`);
  } else if (post.text.length > MAX_TEXT) {
    errors.push(`${label}.text exceeds ${MAX_TEXT} characters`);
  }
  if (post.image !== undefined && post.image !== null && typeof post.image !== 'string') {
    errors.push(`${label}.image must be a string path or null`);
  }
  for (const field of ['location', 'topic']) {
    const value = post[field];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'string' || value.trim().length === 0) {
      errors.push(`${label}.${field} must be a non-empty string or null`);
    }
  }
  return errors;
}

/**
 * Validasi seluruh job. Return daftar error (kosong = valid) supaya caller
 * bisa mencetak SEMUA masalah sekali jalan, bukan satu-satu.
 *
 * @param {Job} job
 * @returns {string[]}
 */
export function validateJob(job) {
  const errors = [];
  if (!job || typeof job !== 'object') {
    errors.push('job must be an object');
    return errors;
  }
  errors.push(...validatePost('job', job));

  if (job.delays !== undefined && job.delays !== null) {
    for (const key of DELAY_KEYS) {
      if (job.delays[key] === undefined) continue;
      const problem = boundsProblem(`job.delays.${key}`, job.delays[key]);
      if (problem) errors.push(problem);
    }
  }

  if (job.replies !== undefined && job.replies !== null) {
    if (!Array.isArray(job.replies)) {
      errors.push('job.replies must be an array');
    } else {
      job.replies.forEach((reply, index) => {
        errors.push(...validatePost(`job.replies[${index}]`, reply));
      });
    }
  }
  return errors;
}
