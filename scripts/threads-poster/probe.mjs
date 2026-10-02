#!/usr/bin/env node
/**
 * Probe heading: verifikasi locator Threads web DAN belum tentu location/topic
 * tersedia. Menyimpan hasil ke selectors.json (verified: true/false + capabilities).
 *
 * Ini langkah S0 plan: PALING BERISIKO, kerjakan pertama sebelum thread.mjs
 * dijalankan untuk publish. Browser WAJIB headed — interaksi manusia.
 *
 * Usage:
 *   npm run threads:probe
 *
 * Output:
 *   - selectors.json terverifikasi (locator Kraktif: role/text/css/placeholder/label/testid)
 *   - capabilities { location, topic, image } dari observasi nyata
 *   - screenshot probe-*.png di reports/ untuk audit
 */
import { createInterface } from 'node:readline';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { compileLocator } from './locators.mjs';

const SELECTORS_PATH = resolve(process.cwd(), 'scripts/threads-poster/selectors.json');
const AUTH_PATH = resolve(process.cwd(), 'scripts/threads-poster/auth.json');
const HOME_URL = 'https://www.threads.com/';

const FIELD_PROBE = [
  { key: 'composeOpen', label: 'tombol Buka Composer (mis. New post / Buat post)' },
  { key: 'composeText', label: 'textarea/target composer (role textbox)' },
  { key: 'imageInput', label: 'input upload gambar (css: input[type=file]) — isi "none" bila tidak ada' },
  { key: 'locationField', label: 'field Lokasi (cek di tombol "..." / More / metdata). none bila tidak ada' },
  { key: 'topicField', label: 'field Topic/Community. none bila tidak ada' },
  { key: 'submitButton', label: 'tombol Submit/Post/Bagikan' },
  { key: 'replyButton', label: 'tombol Reply/Balas pada sebuah post' }
];

function readDraft() {
  return JSON.parse(readFileSync(SELECTORS_PATH, 'utf8'));
}

const ask = (question) =>
  new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });

/**
 * Uji locator di halaman nyata.
 * @returns {Promise<boolean>}
 */
async function verifyLocator(page, spec) {
  if (!spec) return false;
  try {
    const locator = compileLocator(spec)(page);
    if (!locator) return false;
    const count = await locator.count();
    return count > 0;
  } catch {
    return false;
  }
}

function isNone(value) {
  return value === '' || value.toLowerCase() === 'none' || value.toLowerCase() === 'null';
}

async function main() {
  if (!existsSync(AUTH_PATH)) {
    console.error('auth.json tidak ada. Jalankan dulu: npm run threads:auth');
    process.exit(1);
  }

  const draft = readDraft();
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ storageState: AUTH_PATH });
  const page = await context.newPage();

  console.log('=== STEP 1: Home feed ===');
  await page.goto(HOME_URL, { waitUntil: 'domcontentloaded' });
  if (page.url().includes('/login')) {
    console.error('Sesi kedaluwarsa. Jalankan npm run threads:auth lalu ulangi.');
    await browser.close();
    process.exit(1);
  }
  await page.screenshot({ path: resolve(REPORTS_DIR, 'probe-home.png') });

  console.log('=== STEP 2: Cek composeOpen + composeText + submitButton ===');
  console.log('Buka creator/composer Threads seperti biasa (klik tombol New post/Buat post).');
  console.log('JANGAN tutup juga composer — pengujian butuh dialog terbuka.');
  console.log(`Di sini kita akan pakai CANDIDATE: ${draft.composeOpen}`);
  console.log('Kalau CANDIDATE tidak cocok, ketik locator yang benar sesuai format locators.mjs.');
  await ask('Tekan ENTER setelah composer terbuka: ');

  const verified = {};
  for (const field of FIELD_PROBE) {
    if (field.key === 'replyButton') continue; // dicek di STEP 3
    const ok = await verifyLocator(page, draft[field.key]);
    console.log(`${field.label}\n  candidate: ${draft[field.key] ?? '-'} → ${ok ? 'FOUND' : 'TIDAK FOUND'}`);
    if (!ok) {
      const manual = await ask(`Masukkan locator "${field.key}" yang benar (atau "none" bila tidak ada): `);
      if (!isNone(manual)) {
        draft[field.key] = manual;
        const reOk = await verifyLocator(page, manual);
        console.log(`  verifikasi ulang → ${reOk ? 'FOUND ✓' : 'MASIH TIDAK FOUND (rekam apa adanya)'}`);
        verified[field.key] = reOk;
      } else {
        draft[field.key] = null;
        verified[field.key] = false;
      }
    } else {
      verified[field.key] = true;
    }
  }

  console.log('=== STEP 3: Cek replyButton di sebuah post ===');
  const firstPost = page.locator('a[href*="/post/"]').first();
  const postCount = await firstPost.count();
  if (postCount > 0) {
    await firstPost.click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);
  } else {
    console.log('Tidak ada post di feed — balas post manual lain.');
    await ask('Buka salah satu post lalu tekan ENTER: ');
  }

  const replyOk = await verifyLocator(page, draft.replyButton);
  console.log(`Tombol Reply/Balas candidate: ${draft.replyButton ?? '-'} → ${replyOk ? 'FOUND' : 'TIDAK FOUND'}`);
  if (!replyOk) {
    const manual = await ask('Masukkan locator "replyButton" yang benar (atau "none"): ');
    if (!isNone(manual)) {
      draft.replyButton = manual;
      verified.replyButton = await verifyLocator(page, manual);
      console.log(`  verifikasi ulang → ${verified.replyButton ? 'FOUND ✓' : 'MASIH TIDAK FOUND'}`);
    } else {
      draft.replyButton = null;
      verified.replyButton = false;
    }
  } else {
    verified.replyButton = true;
  }
  await page.screenshot({ path: resolve(REPORTS_DIR, 'probe-post.png') });

  console.log('=== STEP 4: Cek URL pattern ===');
  const currentUrl = page.url();
  console.log(`URL saat ini: ${currentUrl}`);
  if (!new RegExp(draft.postUrlPattern).test(currentUrl)) {
    const manual = await ask('URL bukan pola /post/. Tempel pola regex yang benar: ');
    if (manual) draft.postUrlPattern = manual;
  }

  console.log('=== STEP 5: Capabilities (y/N) ===');
  for (const cap of ['location', 'topic', 'image']) {
    const answer = (await ask(`${cap} tersedia di web Threads? (y/N): `)).toLowerCase();
    draft.capabilities[cap] = answer === 'y' || answer === 'yes';
  }

  draft.verified = Object.values(verified).every(Boolean);
  draft.verifiedAt = new Date().toISOString();
  draft.notes =
    draft.verified
      ? 'Terverifikasi via npm run threads:probe.'
      : 'Verifikasi TIDAK LULUS untuk: ' +
        Object.entries(verified)
          .filter(([, ok]) => !ok)
          .map(([key]) => key)
          .join(', ');

  writeFileSync(SELECTORS_PATH, `${JSON.stringify(draft, null, 2)}\n`, 'utf8');
  console.log('');
  console.log(`selectors.json disimpan: ${SELECTORS_PATH}`);
  console.log(`verified: ${draft.verified}`);
  console.log(`capabilities: ${JSON.stringify(draft.capabilities)}`);
  if (!draft.verified) {
    console.warn('Belum fully verified — thread.mjs akan pakai field yang ada dan skip yang tidak.');
  } else {
    console.log('Siap: npm run threads:post -- --job scripts/threads-poster/job.example.json --dry-run');
  }

  await browser.close();
}

main().catch((error) => {
  console.error(`threads:probe gagal: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
