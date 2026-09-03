/**
 * Category mapper for scraped affiliate products.
 *
 * Maps a product's `linkName`/`groupName` text (Shopee's mixed ID/EN titles)
 * to the `ProductCategory` enum used by the site schema.
 *
 * Pure and dependency-free so the same file works from the Node scraper
 * (`scripts/scrape-affiliate.mjs`) and can be unit-tested directly.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const keywords = JSON.parse(
  readFileSync(join(__dirname, 'category-keywords.json'), 'utf8')
);

/** @type {Array<keyof typeof keywords>} */
// Automotive first so vehicle items that also mention gadget words (e.g.
// "Holder Hp ... Handphone" on a motorcycle phone stand) classify as
// automotive instead of electronics.
const order = ['automotive', 'electronics', 'home-living', 'fashion', 'sports-hobby'];

/**
 * @param {string} text
 * @returns {keyof typeof keywords}
 */
export function mapCategory(text, fallback = 'others') {
  const haystack = String(text ?? '').toLowerCase();
  if (!haystack) return fallback;

  // First keyword-hit wins (whole-word match), favouring earlier categories.
  for (const category of order) {
    const list = keywords[category];
    for (const keyword of list) {
      const re = new RegExp(`\\b${escapeRegExp(keyword)}\\b`);
      if (re.test(haystack)) return category;
    }
  }
  return fallback;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}