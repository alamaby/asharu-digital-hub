/**
 * Transform scraped Shopee linktree items into `AffiliateProduct[]` and
 * (re)generate the contents of `src/data/affiliate-products.ts`.
 *
 * Keeps the file's leading comment, the placeholder/verified data when
 * `--keep-existing` is passed, and appends freshly scraped entries deduped
 * by `id` (== Shopee linkId). Preserves the `getFeaturedProducts` helper.
 */
import { mapCategory } from './category-mapper.mjs';

/**
 * @param {object} item      single `landingPageLinkList.linkList[]` entry
 * @param {object} info      `landingPageBaseInfo`
 * @returns {object} AffiliateProduct-shaped object
 */
export function toAffiliateProduct(item, info) {
  const linkId = String(item.linkId);
  const name = String(item.linkName ?? '').trim();
  const merchant = info?.name ? `${info.name} (Shopee)` : 'Shopee';

  return {
    id: `affiliate-${linkId}`,
    name: { id: name, en: name },
    category: mapCategory(name),
    description: { id: name, en: name },
    merchant,
    url: String(item.link),
    image: String(item.image),
    featured: item.featured === true
  };
}

/** Serialize a string as a single-quoted TS literal (apostrophes escaped). */
function sq(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
}

/** Serialize a localized {id, en} object as `{ id: '...', en: '...' }`. */
function lsText(obj) {
  return `{ id: ${sq(obj.id)}, en: ${sq(obj.en)} }`;
}

/**
 * Serialize a products array into a formatted TS module string.
 *
 * @param {unknown[]} products
 * @param {{ urlSuffix?: string }} [meta]
 * @returns {string}
 */
export function renderDataFile(products, meta = {}) {
  const header = `// Affiliate products scraped from the Shopee Linktree\n` +
    `// "${meta.urlSuffix ?? 'asharu'}" (collshp.com).\n` +
    `// Regenerate with: npm run scrape:affiliate\n` +
    `// Prices are intentionally omitted: cards always show "check latest price"\n` +
    `// and the price-change notice instead of unverified numbers.\n` +
    `import type { AffiliateProduct } from './schemas';\n\n`;

  const body = products
    .map((p) => {
      return (
        `  {\n` +
        `    id: ${sq(p.id)},\n` +
        `    name: ${lsText(p.name)},\n` +
        `    category: ${sq(p.category)},\n` +
        `    description: ${lsText(p.description)},\n` +
        `    merchant: ${sq(p.merchant)},\n` +
        `    url: ${sq(p.url)},\n` +
        `    image: ${sq(p.image)},\n` +
        `    featured: ${p.featured}\n` +
        `  }`
      );
    })
    .join(',\n');

  const helper = `\n];\n\nexport function getFeaturedProducts(max = 6): AffiliateProduct[] {\n  return affiliateProducts.filter((product) => product.featured).slice(0, max);\n}\n`;

  return `${header}export const affiliateProducts: AffiliateProduct[] = [\n${body}${helper}`;
}