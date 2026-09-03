/**
 * Scrape the "Asharu" Shopee affiliate linktree (collshp.com/asharu) via its
 * public GraphQL API, download + optimize product images, and rewrite
 * `src/data/affiliate-products.ts`.
 *
 * Usage:
 *   node scripts/scrape-affiliate.mjs [--dry-run] [--limit N] [--max-width N]
 *
 *   --dry-run     print the transformed products instead of writing files
 *   --limit N     cap the number of products fetched (default: all scraped)
 *   --max-width N image resize width (default: 800)
 *   --first-page  only fetch the first page (skip pagination)
 *   --insecure    skip TLS verification (only for corporate-MITM networks)
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { downloadImage } from './lib/image-downloader.mjs';
import { toAffiliateProduct, renderDataFile } from './lib/data-writer.mjs';
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

  const products = [];
  for (const [index, item] of items.entries()) {
    const featured = index < 6;
    const product = toAffiliateProduct({ ...item, featured }, info);

    if (!dryRun) {
      try {
        const local = await downloadImage(item.image, String(item.linkId), { maxWidth, insecure });
        product.image = local;
      } catch (err) {
        console.error(`  [warn] image failed for ${item.linkId}: ${err.message}`);
        product.image = item.image; // fall back to remote (schema may reject on typecheck)
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
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && supabaseKey) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
      console.error('Upserting to Supabase affiliate_products...');
      const rows = products.map((p) => ({
        external_id: p.id.replace('affiliate-', ''),
        name_id: p.name.id,
        name_en: p.name.en,
        category: p.category,
        merchant: p.merchant,
        url: p.url,
        image: p.image,
        is_active: true
      }));
      for (let i = 0; i < rows.length; i += 50) {
        const batch = rows.slice(i, i + 50);
        const { error } = await supabase.from('affiliate_products').upsert(batch, { onConflict: 'external_id' });
        if (error) throw new Error(`Supabase upsert batch ${i}: ${error.message}`);
        console.error(`  upserted ${i + batch.length}/${rows.length}`);
      }
      // Soft-delete: mark missing as inactive
      const remoteIds = new Set(rows.map((r) => r.external_id));
      const { data: existing } = await supabase.from('affiliate_products').select('external_id').eq('is_active', true);
      const toDeactivate = (existing ?? []).filter((r) => !remoteIds.has(r.external_id)).map((r) => r.external_id);
      if (toDeactivate.length > 0) {
        await supabase.from('affiliate_products').update({ is_active: false }).in('external_id', toDeactivate);
        console.error(`  deactivated ${toDeactivate.length} removed products`);
      }
      console.error('Supabase sync done.');
    } catch (e) {
      console.error(`Supabase sync failed (file still written): ${e.message}`);
    }
  } else {
    // Surface as a visible annotation so the stale-DB issue is no longer silent.
    console.log('::warning::Supabase env (SUPABASE_URL, SUPABASE_SECRET_KEY) not set — skipped DB sync (file-only). affiliate_products table will go stale until secrets are added.');
    console.error('Supabase env not set — skipping DB sync (file-only).');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});