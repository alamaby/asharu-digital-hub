/**
 * Scrape the "Asharu" Shopee affiliate linktree (collshp.com/asharu) via its
 * public GraphQL API, download + optimize product images, and dual-write to
 * Supabase (`affiliate_products` Postgres + `affiliate-images` Storage bucket).
 *
 * INTERIM (M2–M3): `src/data/affiliate-products.ts` is still regenerated so the
 * old static readers / workflow checks keep working while they are migrated to
 * DB (M3) and the commit step is removed (M4). Once M4 lands this file write is
 * deleted.
 *
 * Usage:
 *   node scripts/scrape-affiliate.mjs [--dry-run] [--limit N] [--max-width N]
 *
 *   --dry-run     print the transformed products instead of writing files/DB
 *   --limit N     cap the number of products fetched (default: all scraped)
 *   --max-width N image resize width (default: 800)
 *   --first-page  only fetch the first page (skip pagination)
 *   --insecure    skip TLS verification (only for corporate-MITM networks)
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { toAffiliateProduct, renderDataFile } from './lib/data-writer.mjs';
import { uploadAffiliateImage } from './lib/storage-uploader.mjs';
import { postJson } from './lib/http.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const insecure = args.includes('--insecure');
const firstPageOnly = args.includes('--first-page');
function argValue(flag, fallback) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : String(fallback);
}
const limit = dryRun ? Number(argValue('--limit', 5)) : Number(argValue('--limit', Infinity));
const maxWidth = Number(argValue('--max-width', 800));
// Guard mass-deactivation (P3 audit 2026-08-30): scrape sepi jangan nonaktifkan
// mayoritas produk DB. Bila removal > 20% aktif -> abort (override eksplisit).
const allowMassDeactivation = args.includes('--allow-mass-deactivation');
const MASS_DEACTIVATION_THRESHOLD = 0.2;

const URL_SUFFIX = 'asharu';
const API_URL = `https://collshp.com/api/v3/gql/graphql`;
const PAGE_SIZE = 100;

const QUERY = [
  'query getBaseInfoAndLinks(',
  '  $urlSuffix: String!',
  '  $pageSize: String',
  '  $pageNum: String',
  '  $groupId: String',
  '  $linkNameKeyword: String',
  ') {',
  '  landingPageBaseInfo(urlSuffix: $urlSuffix) {',
  '    name',
  '    description',
  '    region',
  '    affiliateId',
  '    groupList { groupId groupName groupType }',
  '  }',
  '  landingPageLinkList(',
  '    urlSuffix: $urlSuffix',
  '    pageSize: $pageSize',
  '    pageNum: $pageNum',
  '    groupId: $groupId',
  '    linkNameKeyword: $linkNameKeyword',
  '  ) {',
  '    totalCount',
  '    linkList {',
  '      linkId',
  '      link',
  '      linkName',
  '      image',
  '      linkType',
  '      groupIds',
  '    }',
  '  }',
  '}'
].join('\n');

async function graphql(variables) {
  return postJson(
    `${API_URL}?q=getBaseInfoAndLinks`,
    {
      operationName: 'getBaseInfoAndLinks',
      variables,
      query: QUERY
    },
    {
      insecure,
      headers: {
        Origin: 'https://collshp.com',
        Referer: `https://collshp.com/${URL_SUFFIX}`
      }
    }
  ).then((json) => {
    if (json.errors?.length) {
      throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
    }
    return json.data;
  });
}

async function main() {
  const first = await graphql({
    urlSuffix: URL_SUFFIX,
    pageSize: String(PAGE_SIZE),
    pageNum: '1'
  });

  const info = first.landingPageBaseInfo;
  const totalCount = first.landingPageLinkList.totalCount;
  let links = [...first.landingPageLinkList.linkList];

  if (!firstPageOnly && totalCount > PAGE_SIZE) {
    const pages = Math.ceil(totalCount / PAGE_SIZE);
    for (let page = 2; page <= pages; page++) {
      const data = await graphql({
        urlSuffix: URL_SUFFIX,
        pageSize: String(PAGE_SIZE),
        pageNum: String(page)
      });
      links = links.concat(data.landingPageLinkList.linkList);
    }
  }

  // Keep only real item links, dedupe by linkId, then cap by limit.
  const seen = new Set();
  const items = links
    .filter((l) => l.linkType === 'ITEM')
    .filter((l) => (seen.has(l.linkId) ? false : (seen.add(l.linkId), true)))
    .slice(0, limit);

  console.error(
    `Fetched ${items.length} products (total ${totalCount}) from "${info.name}"`
  );

  // Single Supabase client shared by Storage upload + DB upsert (dry-run tidak butuhnya).
  let supabase = null;
  /** external_id -> baris DB, di-fetch di depan agar upload gagal bisa fallback ke gambar lama. */
  let prevById = new Map();
  if (!dryRun) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials required (SUPABASE_URL + SUPABASE_SECRET_KEY)');
    }
    const { createClient } = await import('@supabase/supabase-js');
    supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
    const { data: prevRows, error: prevError } = await supabase
      .from('affiliate_products')
      .select('external_id, name_id, name_en, category, merchant, url, image, is_active, is_featured');
    if (prevError) throw new Error(`Supabase fetch existing: ${prevError.message}`);
    prevById = new Map((prevRows ?? []).map((r) => [r.external_id, r]));
  }

  /** external_id produk BARU yang upload gambarnya gagal (tidak ada fallback DB). */
  const failedUploadIds = new Set();
  const products = [];
  for (const [index, item] of items.entries()) {
    const featured = index < 6;
    const product = toAffiliateProduct({ ...item, featured }, info);

    if (!dryRun && supabase) {
      const externalId = String(item.linkId);
      try {
        const { publicUrl } = await uploadAffiliateImage(item.image, externalId, {
          maxWidth,
          insecure,
          supabase
        });
        product.image = publicUrl;
      } catch (err) {
        const prevImage = prevById.get(externalId)?.image;
        if (prevImage) {
          // Produk lama: pakai gambar DB yang sudah ada — baris aman di-upsert
          // (kemungkinan identik -> di-skip), run tidak perlu gagal.
          console.error(`  [warn] image upload failed for ${item.linkId}, reusing previous DB image: ${err.message}`);
          product.image = prevImage;
        } else {
          // Produk benar-benar baru tanpa gambar: JANGAN tulis URL remote ke DB
          // (schema menolak; next/image 400). Kecualikan dari upsert di bawah
          // dan gagalkan run dengan keras (insiden 2026-09-15: 240 URL remote
          // sempat tertulis ke kolom image).
          console.error(`  [warn] image upload failed for new product ${item.linkId}: ${err.message}`);
          product.image = item.image; // interim file only; never upserted (see failedUploadIds filter)
          failedUploadIds.add(externalId);
        }
      }
    }

    products.push(product);
    console.error(`  ${index + 1}. ${product.name.id.slice(0, 80)} [${product.category}]`);
  }

  if (dryRun) {
    console.log(renderDataFile(products, { urlSuffix: URL_SUFFIX }));
    return;
  }

  const outPath = path.join(process.cwd(), 'src', 'data', 'affiliate-products.ts');
  await fs.writeFile(outPath, renderDataFile(products, { urlSuffix: URL_SUFFIX }), 'utf8');
  console.error(`\nWrote ${outPath} with ${products.length} products.`);

  // Dual-write to Supabase (incremental, friendly_code ASH-XXX auto-generated)
  // Fail-loud: file-only runs mask DB drift (kasus Sep 2026: 9 produk hilang
  // karena friendly_code collision, run tetap hijau). Non-dry-run tanpa sync
  // sukses = exit non-zero agar workflow merah dan tidak commit file-only.
  let syncFailed = false;
  if (supabase) {
    try {
      console.error('Upserting to Supabase affiliate_products...');
      const rows = products.map((p) => ({
        external_id: p.id.replace('affiliate-', ''),
        name_id: p.name.id,
        name_en: p.name.en,
        category: p.category,
        merchant: p.merchant,
        url: p.url,
        image: p.image,
        is_active: true,
        is_featured: p.featured
      }));
      // Upsert hanya baris baru/berubah: tiap baris upsert memicu trigger
      // BEFORE INSERT spekulatif yang membakar 1 nilai sequence meski akhirnya
      // UPDATE — full-upsert 221 baris/hari menghabiskan sequence sia-sia.
      // Pakai prevById yang di-fetch sebelum loop gambar (tidak ada penulis
      // konkuren berkat concurrency group workflow).
      const byId = prevById;
      const COMPARE_KEYS = ['name_id', 'name_en', 'category', 'merchant', 'url', 'image', 'is_active', 'is_featured'];
      const changed = rows.filter((r) => {
        // Produk baru yang upload gambarnya gagal: JANGAN upsert (DB tidak
        // boleh menyimpan URL remote yang schema-invalid). Run tetap gagal
        // di bawah via failedUploadIds.
        if (failedUploadIds.has(r.external_id)) return false;
        const e = byId.get(r.external_id);
        if (!e) return true;
        return COMPARE_KEYS.some((k) => (e[k] ?? null) !== (r[k] ?? null));
      });
      if (failedUploadIds.size > 0) {
        console.error(`  excluding ${failedUploadIds.size} new product(s) with failed image uploads from upsert: ${[...failedUploadIds].slice(0, 10).join(',')}`);
      }
      console.error(`  ${changed.length}/${rows.length} new or changed, skipping ${rows.length - changed.length} identical (saves sequence burns)`);
      for (let i = 0; i < changed.length; i += 50) {
        const batch = changed.slice(i, i + 50);
        const { error } = await supabase.from('affiliate_products').upsert(batch, { onConflict: 'external_id' });
        if (error) throw new Error(`Supabase upsert batch ${i}: ${error.message}`);
        console.error(`  upserted ${i + batch.length}/${changed.length}`);
      }
      // Soft-delete: mark missing as inactive
      const remoteIds = new Set(rows.map((r) => r.external_id));
      const { data: existing } = await supabase.from('affiliate_products').select('external_id').eq('is_active', true);
      const activeCount = (existing ?? []).length;
      const toDeactivate = (existing ?? []).filter((r) => !remoteIds.has(r.external_id)).map((r) => r.external_id);
      if (toDeactivate.length > 0) {
        const removalRatio = activeCount > 0 ? toDeactivate.length / activeCount : 1;
        if (removalRatio > MASS_DEACTIVATION_THRESHOLD && !allowMassDeactivation) {
          throw new Error(
            `Soft-delete guard: ${toDeactivate.length}/${activeCount} produk aktif (${Math.round(removalRatio * 100)}%) akan dinonaktifkan — scrape mungkin sepi/transient. ` +
            'Perbaiki scrape atau jalankan ulang dengan --allow-mass-deactivation untuk override.'
          );
        }
        await supabase.from('affiliate_products').update({ is_active: false }).in('external_id', toDeactivate);
        console.error(`  deactivated ${toDeactivate.length} removed products`);
      }
      console.error('Supabase sync done.');
    } catch (e) {
      console.error(`Supabase sync failed (file still written): ${e.message}`);
      syncFailed = true;
    }
  } else if (!dryRun && !supabase) {
    // Surface as a visible annotation so the stale-DB issue is no longer silent.
    console.log('::warning::Supabase env (SUPABASE_URL, SUPABASE_SECRET_KEY) not set — skipped DB sync (file-only). affiliate_products table will go stale until secrets are added.');
    console.error('Supabase env not set — skipping DB sync (file-only).');
    syncFailed = true;
  }
  if (failedUploadIds.size > 0 && !syncFailed) {
    // Produk baru tanpa gambar Storage: DB sengaja tidak di-upsert untuknya
    // (lihat filter di atas) — gagalkan run dengan keras agar terlihat di CI
    // dan diperbaiki, bukan diam-diam menyimpan URL remote yang invalid.
    console.error(`Image uploads failed for ${failedUploadIds.size} new product(s) — see warnings above.`);
    syncFailed = true;
  }
  if (syncFailed) {
    console.error('DB sync did not complete — exiting non-zero so CI fails loudly instead of committing file-only data.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});