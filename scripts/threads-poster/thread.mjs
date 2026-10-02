#!/usr/bin/env node
/**
 * Posting thread Threads via Playwright (manual run di laptop).
 *
 * Usage:
 *   npm run threads:post -- --job scripts/threads-poster/job.example.json
 *   npm run threads:post -- --job myjob.json --headed
 *   npm run threads:post -- --job myjob.json --dry-run --headed
 *   npm run threads:post -- --job myjob.json --fast
 *   npm run threads:post -- --job myjob.json --action-delay 4,12 --publish-delay 300,600
 *
 * Job schema: lihat scripts/threads-poster/job.example.json
 * Delay (configurable, default produksi):
 *   action  4–12 detik   — jeda antar klik/isi UI
 *   publish 300–600 detik — jeda antar publish post/reply
 *
 * Perilaku aman:
 * - Semua kegagalan publish → URL checker akan gagal → exit non-zero, TIDAK
 *   retry otomatis (hindari dobel-post). Resume = job baru dengan sisa reply.
 * - Report SELALU ditulis ke scripts/threads-poster/reports/ (memuat URL).
 * - Post login: sesi dari auth.json; expired = fork: proverka URL berisi
 *   'accounts/login' → error 'sesi tidak valid; jalankan npm run threads:auth'.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { chromium } from 'playwright';
import { mergeDelays, parseDelayFlag, parseJobFile, validateJob } from './job.mjs';
import { DEFAULT_ACTION_DELAY, DEFAULT_PUBLISH_DELAY, actionDelayMs, publishDelayMs } from './delays.mjs';
import { createReport, recordPost, saveReport, isThreadsUrl } from './report.mjs';
import { resolveLocator } from './locators.mjs';

// npm scripts selalu jalan dari root package — cwd adalah base path yang aman
// untuk CLI maupun saat di-import oleh vitest (import.meta.url bukan file:// di jsdom).
const SELECTORS_PATH = resolve(process.cwd(), 'scripts/threads-poster/selectors.json');
const AUTH_PATH = resolve(process.cwd(), 'scripts/threads-poster/auth.json');
const REPORTS_DIR = resolve(process.cwd(), 'scripts/threads-poster/reports');

const FAST_ACTION_DELAY = { minSec: 1, maxSec: 2 };
const FAST_PUBLISH_DELAY = { minSec: 5, maxSec: 10 };
const PUBLISH_TIMEOUT_MS = 60_000;
const PICKER_TIMEOUT_MS = 15_000;

function readSelectors() {
  let raw;
  try {
    raw = JSON.parse(readFileSync(SELECTORS_PATH, 'utf8'));
  } catch {
    console.error(`selectors.json tidak ada atau tidak valid: ${SELECTORS_PATH}`);
    console.error('Langkah dulu: npm run threads:probe (butuh login manual sekali).');
    process.exit(1);
  }
  return raw;
}

export function parseArgs(argv) {
  const args = {
    jobPath: null,
    headed: false,
    headless: true,
    dryRun: false,
    fast: false,
    actionDelay: null,
    publishDelay: null,
    yes: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--job') {
      args.jobPath = argv[i + 1];
      i += 1;
    } else if (arg === '--headed') {
      args.headed = true;
      args.headless = false;
    } else if (arg === '--headless') {
      args.headless = true;
      args.headed = false;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--fast') {
      args.fast = true;
    } else if (arg === '--yes') {
      args.yes = true;
    } else if (arg === '--action-delay') {
      args.actionDelay = argv[i + 1];
      i += 1;
    } else if (arg === '--publish-delay') {
      args.publishDelay = argv[i + 1];
      i += 1;
    } else {
      console.error(`Unknown flag: ${arg}`);
      process.exit(2);
    }
  }
  return args;
}

function die(msgs, code = 2) {
  const lines = Array.isArray(msgs) ? msgs : [msgs];
  for (const line of lines) console.error(line);
  process.exit(code);
}

async function confirmFast() {
  console.log('FAST MODE — delay dikonfigurasi kecil; TIDAK untuk produksi.');
  const answer = await ask('Lanjutkan? (ketik YA): ');
  if (answer !== 'YA') {
    console.log('Dibatalkan.');
    process.exit(0);
  }
}

const ask = (question) =>
  new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Satu-satunya cara melakukan aksi UI: jeda acak action-delay SEBELUM aksi,
 * lalu detik aktual dicatat ke report.
 */
async function pacedAction(action, ctx) {
  const ms = await actionDelayMs(ctx.actionDelay, ctx.rng, ctx.sleepImpl);
  const sec = Math.round(ms / 1000);
  ctx.report.actionDelaysSec.push(sec);
  console.log(`  [delay] jeda aksi ${sec}s`);
  await action();
}

async function checkLogin(page) {
  const url = page.url();
  if (url.includes('/login') || url.includes('accounts/login')) {
    throw new Error('sesi tidak valid; jalankan npm run threads:auth');
  }
  return url;
}

async function fillComposer(page, selectors, text, ctx) {
  const open = resolveLocator(page, selectors.composeOpen);
  if (!open) {
    throw new Error('selectors.json: composeOpen belum di-set — jalankan npm run threads:probe');
  }
  // Klik bisa gagal bila dialog sudah terbuka — itu bukan error fungsional.
  await pacedAction(
    () => open.click().catch(() => open.click().catch(() => null)),
    ctx
  );

  const box = resolveLocator(page, selectors.composeText);
  if (!box) {
    throw new Error('selectors.json: composeText belum di-set — jalankan npm run threads:probe');
  }
  await pacedAction(() => box.fill(text), ctx);
}

async function attachImage(page, selectors, imagePath, ctx) {
  if (!imagePath) return false;
  if (!existsSync(imagePath)) {
    throw new Error(`image file not found: ${imagePath}`);
  }
  const input = resolveLocator(page, selectors.imageInput);
  if (!input) {
    console.warn(`  [warn] selectors.json: imageInput belum di-set — image dilewati (${imagePath})`);
    return false;
  }
  await pacedAction(() => input.setInputFiles(imagePath), ctx);
  // Upload container ke Threads butuh waktu; tanpa jeda submit bisa kalah cepat.
  await sleepMs(500);
  return true;
}

async function pickLocationTopic(page, selectors, { location, topic, skipped }, ctx) {
  for (const [field, value] of [
    ['locationField', location],
    ['topicField', topic]
  ]) {
    if (!value) continue;
    const input = resolveLocator(page, selectors[field]);
    const name = field === 'locationField' ? 'location' : 'topic';
    if (!input) {
      console.warn(`  [warn] ${name} tidak tersedia di web / belum diprobe — dilewati`);
      skipped.push(name);
      continue;
    }
    await pacedAction(() => input.fill(value), ctx);
    const suggestion = page.locator('[role="option"], [role="listbox"] li').first();
    await pacedAction(async () => {
      await suggestion.waitFor({ state: 'visible', timeout: PICKER_TIMEOUT_MS }).catch(() => null);
      await suggestion.click().catch(() => null);
    }, ctx);
  }
}

async function submitAndCaptureUrl(page, selectors) {
  const submit = resolveLocator(page, selectors.submitButton);
  if (!submit) {
    throw new Error('selectors.json: submitButton belum di-set — jalankan npm run threads:probe');
  }
  const before = page.url();
  await submit.click();
  const pattern = new RegExp(selectors.postUrlPattern);
  try {
    await page.waitForURL(pattern, { timeout: PUBLISH_TIMEOUT_MS });
  } catch {
    // Threads kadang pindah halaman tanpa cocok pattern (mis. modal tertutup) —
    // URL Threads yang BERBEDA dari sebelum submit tetap cukup sebagai bukti publish.
    const now = page.url();
    if (now !== before && isThreadsUrl(now)) return now;
    throw new Error(
      `publish timeout setelah ${PUBLISH_TIMEOUT_MS / 1000}s (url tetap ${now || 'kosong'})`
    );
  }
  if (!isThreadsUrl(page.url())) throw new Error(`url pasca-publish bukan Threads: ${page.url()}`);
  return page.url();
}

async function postMain(page, selectors, job, ctx) {
  await checkLogin(page);
  await page.goto(selectors.homeUrl, { waitUntil: 'domcontentloaded' });

  await fillComposer(page, selectors, job.text, ctx);

  const attached = await attachImage(page, selectors, job.image, ctx);
  if (job.image && !attached) ctx.report.skipped.push('image');

  await pickLocationTopic(
    page,
    selectors,
    { location: job.location, topic: job.topic, skipped: ctx.report.skipped },
    ctx
  );

  if (ctx.dryRun) {
    const shot = resolve(REPORTS_DIR, 'dryrun-main.png');
    await page.screenshot({ path: shot, fullPage: false });
    console.log(`[dry-run] composer terisi; TIDAK dipublikasi. (screenshot: ${shot})`);
    return null;
  }

  try {
    const url = await submitAndCaptureUrl(page, selectors);
    recordPost(ctx.report, url);
    return url;
  } catch (error) {
    console.warn(`  [warn] submit post utama gagal: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

async function postReply(page, selectors, item, parentUrl, ctx) {
  await checkLogin(page);
  await page.goto(parentUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => null);

  const replyButton = resolveLocator(page, selectors.replyButton);
  if (!replyButton) {
    throw new Error('selectors.json: replyButton belum di-set — jalankan npm run threads:probe');
  }
  await pacedAction(() => replyButton.click(), ctx);

  const box = resolveLocator(page, selectors.composeText);
  if (!box) {
    throw new Error('selectors.json: composeText belum di-set — jalankan npm run threads:probe');
  }
  await pacedAction(() => box.fill(item.text), ctx);

  const attached = await attachImage(page, selectors, item.image, ctx);
  if (item.image && !attached) ctx.report.skipped.push('image');

  await pickLocationTopic(
    page,
    selectors,
    { location: item.location, topic: item.topic, skipped: ctx.report.skipped },
    ctx
  );

  const url = await submitAndCaptureUrl(page, selectors);
  recordPost(ctx.report, url);
  return url;
}

export async function runThread(page, selectors, job, ctx) {
  const mainUrl = await postMain(page, selectors, job, ctx);
  if (!mainUrl) {
    if (!ctx.dryRun) throw new Error('post utama gagal (tidak ada URL) — chain dibatalkan');
    return;
  }
  console.log(`[ok] post utama: ${mainUrl}`);

  let parentUrl = mainUrl;
  const replies = job.replies ?? [];
  for (let i = 0; i < replies.length; i += 1) {
    if (!ctx.dryRun) {
      const ms = await publishDelayMs(ctx.effectiveDelays.publish, ctx.rng, ctx.sleepImpl);
      const sec = Math.round(ms / 1000);
      ctx.report.publishDelaysSec.push(sec);
      console.log(`  [delay] jeda publish ${sec}s sebelum reply ${i + 1}`);
    }
    try {
      parentUrl = await postReply(page, selectors, replies[i], parentUrl, ctx);
      console.log(`[ok] reply ${i + 1}: ${parentUrl}`);
    } catch (error) {
      ctx.report.failedAt = {
        index: i,
        error: error instanceof Error ? error.message : String(error)
      };
      throw error;
    }
  }
}

function logConfig(ctx) {
  console.log('');
  console.log('[config] delay (CLI > job > default):');
  console.log(`  action   ${ctx.effectiveDelays.action.minSec}–${ctx.effectiveDelays.action.maxSec}s`);
  console.log(`  publish  ${ctx.effectiveDelays.publish.minSec}–${ctx.effectiveDelays.publish.maxSec}s`);
  console.log(`[config] mode: ${ctx.dryRun ? 'DRY-RUN (tanpa publish)' : 'PUBLISH'} | browser: ${ctx.headless ? 'headless' : 'headed'}`);
  if (ctx.fast) console.log('[config] FAST MODE aktif: delay dikurangi untuk debugging.');
  console.log('');
}

/**
 * @param {object} opts — dependency injection untuk testability
 */
export async function main(argv = process.argv.slice(2), opts = {}) {
  const args = parseArgs(argv);
  if (!args.jobPath) {
    die([
      'Usage: node scripts/threads-poster/thread.mjs --job <file.json> [--headed] [--dry-run] [--fast] [--yes]',
      '                              [--action-delay min,max] [--publish-delay min,max]'
    ]);
  }

  const job = parseJobFile(args.jobPath);
  const errors = validateJob(job);
  if (errors.length > 0) die(errors);

  const defaults = { action: DEFAULT_ACTION_DELAY, publish: DEFAULT_PUBLISH_DELAY };
  const cliDelays = {};
  if (args.actionDelay) cliDelays.action = parseDelayFlag(args.actionDelay, 'action');
  if (args.publishDelay) cliDelays.publish = parseDelayFlag(args.publishDelay, 'publish');
  let effectiveDelays = mergeDelays(job.delays, cliDelays, defaults);
  if (args.fast) {
    console.warn('FAST MODE — bukan delay produksi');
    if (!args.dryRun && !args.yes) await confirmFast();
    effectiveDelays = { action: { ...FAST_ACTION_DELAY }, publish: { ...FAST_PUBLISH_DELAY } };
  }

  if (!existsSync(AUTH_PATH)) {
    die(['auth.json tidak ditemukan. Jalankan: npm run threads:auth']);
  }
  const selectors = readSelectors();
  if (!selectors.verified) {
    console.warn('[warn] selectors.json belum diverifikasi (verified=false). Pertama: npm run threads:probe.');
  }

  const report = createReport(args.jobPath, effectiveDelays);
  report.dryRun = args.dryRun;
  const ctx = {
    report,
    effectiveDelays,
    actionDelay: effectiveDelays.action,
    dryRun: args.dryRun,
    headless: args.headless,
    fast: args.fast,
    selectors,
    rng: opts.rng ?? Math.random,
    sleepImpl: opts.sleepImpl
  };

  logConfig(ctx);

  mkdirSync(REPORTS_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: args.headless });
  const context = await browser.newContext({
    storageState: AUTH_PATH,
    viewport: { width: 1280, height: 900 }
  });
  const page = await context.newPage();

  try {
    await runThread(page, selectors, job, ctx);
    const path = saveReport(ctx.report, REPORTS_DIR);
    printLinks(ctx.report);
    console.log(`[report] ${path}`);
    if (args.dryRun) console.log('[dry-run] selesai; tidak ada yang dipublikasi.');
  } catch (error) {
    ctx.report.failedAt ??= {
      index: null,
      error: error instanceof Error ? error.message : String(error)
    };
    try {
      const path = saveReport(ctx.report, REPORTS_DIR);
      console.log(`[report] parsial: ${path}`);
    } catch {
      console.error('[report] GAGAL menulis report parsial.');
    }
    throw error;
  } finally {
    await browser.close().catch(() => null);
  }
}

function printLinks(report) {
  console.log('');
  const urls = [report.mainUrl, ...report.replies].filter(Boolean);
  if (urls.length === 0) {
    console.log('[link] belum ada post yang terekam.');
    return;
  }
  urls.forEach((url, index) => {
    console.log(`[link] ${index === 0 ? 'utama' : `reply ${index}`}: ${url}`);
  });
}

// Hanya jalankan saat dieksekusi langsung (bukan saat di-import test).
const isDirectRun =
  process.argv[1] && resolve(process.argv[1]) === resolve(process.cwd(), 'scripts/threads-poster/thread.mjs');
if (isDirectRun) {
  main().catch((error) => {
    console.error(`threads:post gagal: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
}
