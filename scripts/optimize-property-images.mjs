/**
 * One-off migration helper: optimize property photos into WebP and emit a
 * dimensions manifest used to fill `gallery` entries in src/data/properties.ts.
 *
 * Usage:
 *   node scripts/optimize-property-images.mjs \
 *     --src "../landing-page-rumah-kamarasan/images" \
 *     --dest "public/images/properties/dijual-rumah-kamarasan-bandung-timur" \
 *     [--width 1400] [--quality 80] [--copy]
 *
 * --copy  copies files as-is (no re-encode) — for assets that are already
 *         optimized. Manifest still reports real dimensions.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const args = process.argv.slice(2);
function argValue(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

const srcDir = argValue('--src');
const destDir = argValue('--dest');
const maxWidth = Number(argValue('--width') ?? 1400);
const quality = Number(argValue('--quality') ?? 80);
const copyOnly = args.includes('--copy');

if (!srcDir || !destDir) {
  console.error('Required: --src <dir> --dest <dir> [--width N] [--quality N] [--copy]');
  process.exit(1);
}

const files = (await fs.readdir(srcDir))
  .filter((file) => /\.(jpe?g|png|webp)$/i.test(file))
  .sort();

await fs.mkdir(destDir, { recursive: true });

const manifest = [];
let index = 0;
for (const file of files) {
  const source = path.join(srcDir, file);
  const number = String(++index).padStart(2, '0');
  const destName = `${number}.webp`;
  const dest = path.join(destDir, destName);

  if (copyOnly && file.toLowerCase().endsWith('.webp')) {
    await fs.copyFile(source, dest);
  } else {
    await sharp(source)
      .rotate()
      .resize({ width: Math.min(maxWidth, copyOnly ? 100000 : maxWidth), withoutEnlargement: true })
      .webp({ quality })
      .toFile(dest);
  }

  const meta = await sharp(dest).metadata();
  manifest.push({ file: destName, width: meta.width, height: meta.height });
  console.error(`${destName}  ${meta.width}x${meta.height}`);
}

process.stdout.write(JSON.stringify(manifest, null, 2));
