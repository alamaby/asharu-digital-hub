/**
 * Satu-satunya sumber jeda acak untuk threads-poster.
 * Semua delay (aksi UI dan publish) WAJIB lewat file ini — dilarang
 * `setTimeout` telanjang di `auth.mjs`, `probe.mjs`, atau `thread.mjs`.
 *
 * Nilai default adalah produksi:
 * - action  4–12 detik   (jeda antar klik/isi UI)
 * - publish 300–600 detik (jeda antar publish post/reply)
 *
 * Keduanya dapat ditimpa via job JSON (`delays.action` / `delays.publish`)
 * atau CLI (`--action-delay min,max` / `--publish-delay min,max`).
 */

/** @type {{ minSec: number, maxSec: number }} */
export const DEFAULT_ACTION_DELAY = { minSec: 4, maxSec: 12 };

/** @type {{ minSec: number, maxSec: number }} */
export const DEFAULT_PUBLISH_DELAY = { minSec: 300, maxSec: 600 };

const SECOND_MS = 1000;

function assertBounds(minSec, maxSec) {
  for (const [name, value] of [
    ['minSec', minSec],
    ['maxSec', maxSec]
  ]) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`delay bounds must be non-negative integers (${name}=${value})`);
    }
  }
  if (minSec > maxSec) {
    throw new Error(`delay minSec (${minSec}) must be <= maxSec (${maxSec})`);
  }
}

/**
 * Bulatkan integer detik inklusif di [minSec, maxSec].
 *
 * @param {number} minSec
 * @param {number} maxSec
 * @param {() => number} [rng] default Math.random (di-inject agar test deterministik)
 * @returns {number}
 */
export function randomSec(minSec, maxSec, rng = Math.random) {
  assertBounds(minSec, maxSec);
  return Math.floor(rng() * (maxSec - minSec + 1)) + minSec;
}

/**
 * @param {number} ms
 * @param {(ms: number) => Promise<void>} [sleepImpl] default setTimeout-based
 * @returns {Promise<void>}
 */
export function sleep(ms, sleepImpl) {
  if (!Number.isFinite(ms) || ms < 0) {
    throw new Error(`sleep ms must be a non-negative finite number (got ${ms})`);
  }
  if (sleepImpl) return sleepImpl(ms);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Jeda antar aksi UI. Return milidetik aktual (untuk di-log ke report).
 *
 * @param {{ minSec: number, maxSec: number }} bounds
 * @param {() => number} [rng]
 * @param {(ms: number) => Promise<void>} [sleepImpl]
 * @returns {Promise<number>} ms yang dipakai
 */
export async function actionDelayMs(bounds, rng, sleepImpl) {
  const sec = randomSec(bounds.minSec, bounds.maxSec, rng);
  const ms = sec * SECOND_MS;
  await sleep(ms, sleepImpl);
  return ms;
}

/**
 * Jeda antar publish post/reply. Return milidetik aktual.
 *
 * @param {{ minSec: number, maxSec: number }} bounds
 * @param {() => number} [rng]
 * @param {(ms: number) => Promise<void>} [sleepImpl]
 * @returns {Promise<number>} ms yang dipakai
 */
export async function publishDelayMs(bounds, rng, sleepImpl) {
  const sec = randomSec(bounds.minSec, bounds.maxSec, rng);
  const ms = sec * SECOND_MS;
  await sleep(ms, sleepImpl);
  return ms;
}
