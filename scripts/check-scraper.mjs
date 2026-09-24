import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const files = [
  'scripts/check-scraper.mjs',
  'scripts/scrape-affiliate.mjs',
  'scripts/lib/category-mapper.mjs',
  'scripts/lib/data-writer.mjs',
  'scripts/lib/http.mjs',
  'scripts/lib/image-downloader.mjs',
  'scripts/lib/storage-uploader.mjs'
];

let failed = false;

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', resolve(file)], { stdio: 'inherit' });
  if (result.status !== 0) failed = true;
}

if (failed) process.exitCode = 1;
