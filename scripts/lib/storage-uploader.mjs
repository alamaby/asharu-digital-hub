/**
 * Upload processed affiliate image bytes to the public Supabase Storage bucket
 * `affiliate-images` (M1.2). Content-addressed filename with a stable
 * `<externalId>-<sha256-12>.webp` scheme — identical to the old local
 * `public/images/products/affiliate/` naming so the DB column swap is
 * transparent and reruns are idempotent (skip-if-exists).
 *
 * Uses the service client so uploads bypass anon RLS (writer), while reads
 * remain public via the `affiliate_images_public_read` policy.
 */
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const AFFILIATE_BUCKET = 'affiliate-images';

/** Resize + encode to WebP (same defaults as image-downloader.mjs). */
async function toWebp(buf, opts = {}) {
  const { maxWidth = 800, quality = 80 } = opts;
  return sharp(buf)
    .rotate()
    .resize({ width: maxWidth, withoutEnlargement: true })
    .webp({ quality })
    .toBuffer();
}

/**
 * Download remote image bytes, convert to optimized WebP, upload to
 * `affiliate-images`, and return the public URL + storage path.
 *
 * Skip-if-exists: bila objek dengan nama yang sama sudah ada (content
 * addressed), lewati upload dan langsung kembalikan URL — idempoten untuk
 * rerun harian.
 *
 * @param {string} remoteUrl
 * @param {string} externalId   stable key (Shopee linkId)
 * @param {{ maxWidth?: number, quality?: number, supabase: import('@supabase/supabase-js').SupabaseClient, insecure?: boolean }} opts
 * @returns {Promise<{ storagePath: string, publicUrl: string }>}
 */
export async function uploadAffiliateImage(remoteUrl, externalId, opts) {
  const { maxWidth = 800, quality = 80, supabase, insecure = false } = opts;
  // Reuse the shared HTTP getter (system trust store, not fetch, per http.mjs).
  const { getBuffer } = await import('./http.mjs');
  const raw = await getBuffer(remoteUrl, {
    insecure,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      Accept: 'image/avif,image/webp,image/png,image/*,*/*;q=0.8',
      Referer: 'https://collshp.com/'
    }
  });

  const webp = await toWebp(raw, { maxWidth, quality });
  const hash = createHash('sha256').update(webp).digest('hex').slice(0, 12);
  const storagePath = `${externalId}-${hash}.webp`;

  // Skip-if-exists (storage.exists, NOT a PostgREST query on storage.objects).
  const { data: exists, error: existsErr } = await supabase.storage
    .from(AFFILIATE_BUCKET)
    .exists(storagePath);
  if (existsErr) {
    throw new Error(`storage exists check failed: ${existsErr.message}`);
  }
  if (!exists) {
    const { error: uploadError } = await supabase.storage
      .from(AFFILIATE_BUCKET)
      .upload(storagePath, webp, { contentType: 'image/webp', upsert: true });
    if (uploadError) {
      throw new Error(`storage upload failed: ${uploadError.message}`);
    }
  }

  const { data: urlRes } = supabase.storage.from(AFFILIATE_BUCKET).getPublicUrl(storagePath);
  if (!urlRes?.publicUrl) throw new Error('storage getPublicUrl returned empty');
  return { storagePath, publicUrl: urlRes.publicUrl };
}
