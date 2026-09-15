/**
 * Transform scraped Shopee linktree items into `AffiliateProduct[]`.
 *
 * M4 (DB-only): the static `src/data/affiliate-products.ts` writer
 * (`renderDataFile`) is deleted — the scraper writes straight to Supabase
 * (`affiliate_products` + `affiliate-images` bucket). Only the pure
 * transform `toAffiliateProduct` remains.
 */
import { mapCategory } from './category-mapper.mjs';

/**
 * @param {object} item      single `landingPageLinkList.linkList[]` entry
 * @param {object} info      `landingPageBaseInfo`
 * @returns {object} AffiliateProduct-shaped object
 */
export function toAffiliateProduct(item, info) {
  const linkId = String(item.linkId);
  // Collapse internal whitespace: Shopee titles occasionally contain double
  // spaces, which break exact-name matchers (CI incident 2026-09-12).
  const name = String(item.linkName ?? '').replace(/\s+/g, ' ').trim();
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

