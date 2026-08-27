/**
 * Download + optimize a remote product image into a local WebP under
 * `public/images/products/affiliate/`, deduping by content hash.
 *
 * Sharp handles resize (max width) and WebP encode. Returns the site-relative
 * path (`/images/products/affiliate/<id>.webp`) for the schema `image` field.
 *
 * Uses Node's `https` module (system trust store) rather than undici `fetch`:
 * on corporately-inspected networks the latter rejects the MITM CA while the
 * system store — the same one curl uses — succeeds.
 */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { getBuffer } from './http.mjs';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * @param {string} remoteUrl
 * @param {string} id        stable key (e.g. Shopee linkId)
 * @param {{ maxWidth?: number, quality?: number, destDir?: string, insecure?: boolean }} [opts]
 * @returns {Promise<string>} site-relative `/images/...` path
 */
export async function downloadImage(remoteUrl, id, opts = {}) {
  const {
    maxWidth = 800,
    quality = 80,
    destDir = path.join(process.cwd(), 'public', 'images', 'products', 'affiliate'),
    insecure = false
  } = opts;

  const buf = await getBuffer(remoteUrl, {
    insecure,
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'image/avif,image/webp,image/png,image/*,*/*;q=0.8',
      Referer: 'https://collshp.com/'
    }
  });

  const hash = createHash('sha256').update(buf).digest('hex').slice(0, 12);

  await fs.mkdir(destDir, { recursive: true });

  const destName = `${id}-${hash}.webp`;
  const destPath = path.join(destDir, destName);

  // Skip re-encode when the file already exists (content-addressed).
  try {
    await fs.access(destPath);
    return `/images/products/affiliate/${destName}`;
  } catch {
    /* not cached — continue */
  }

  await sharp(buf)
    .rotate()
    .resize({ width: maxWidth, withoutEnlargement: true })
    .webp({ quality })
    .toFile(destPath);

  return `/images/products/affiliate/${destName}`;
}