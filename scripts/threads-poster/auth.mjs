#!/usr/bin/env node
/**
 * Login sekali ke Threads dan simpan sesi Playwright (storage state).
 *
 * WAJIB dijalankan TERLEBIH DAHULU sebelum `threads:post`/`threads:probe`.
 * Browser selalu headed — login butuh interaksi manusia (termasuk 2FA).
 *
 * Usage:
 *   npm run threads:auth
 *
 * Hasil: scripts/threads-poster/auth.json (TER-GITIGNORE — jangan pernah
 * di-commit; file ini memuat cookie sesi = rahasia).
 *
 * Bila sesi sudah ada, script tetap membukanya: kamu bisa logout lalu login
 * sebagai akun lain, lalu ENTER untuk menimpa.
 */
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const AUTH_STATE_PATH = resolve(process.cwd(), 'scripts/threads-poster/auth.json');
const LOGIN_URL = 'https://www.threads.com/login';
const HOME_URL = 'https://www.threads.com/';

const ask = (question) =>
  new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    storageState: AUTH_STATE_PATH
  });
  const page = await context.newPage();

  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
  console.log('');
  console.log('Browser terbuka. Login manual sebagai @asharu.id (termasuk 2FA bila diminta).');
  console.log('JANGAN tekan ENTER sebelum feed Threads sudah tampil.');
  await ask('Sudah login penuh? Tekan ENTER untuk menyimpan sesi: ');

  // Verifikasi ringan: halaman harus bukan halaman login lagi.
  await page.goto(HOME_URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
  if (page.url().includes('/login')) {
    console.error('login belum selesai (masih di halaman login). Sesi TIDAK disimpan. Ulangi.');
    await browser.close();
    process.exit(1);
  }

  await context.storageState({ path: AUTH_STATE_PATH });
  console.log(`Sesi tersimpan → ${AUTH_STATE_PATH}`);
  console.log('File ini gitignore. Jangan commit, jangan share, jangan print isinya.');
  await browser.close();
}

main().catch((error) => {
  console.error(`threads:auth gagal: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
