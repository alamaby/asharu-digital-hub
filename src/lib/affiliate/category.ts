import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type ProductCategory = 'automotive' | 'electronics' | 'home-living' | 'fashion' | 'sports-hobby' | 'others';

// Automotive first so vehicle items that also mention gadget words (e.g.
// "Holder Hp ... Handphone" on a motorcycle phone stand) classify as
// automotive instead of electronics.
const ORDER: ProductCategory[] = ['automotive', 'electronics', 'home-living', 'fashion', 'sports-hobby'];

/**
 * Category keyword map. Single source of truth lives in
 * `scripts/lib/category-keywords.json` so the Node scraper (`*.mjs`) and the
 * app share the exact same classification without a build step.
 */
const keywords = JSON.parse(
  readFileSync(
    join(process.cwd(), 'scripts', 'lib', 'category-keywords.json'),
    'utf8'
  )
) as Record<ProductCategory, string[]>;

/**
 * Map a Shopee product title (mixed ID/EN text) to a `ProductCategory`.
 * First matching keyword wins, favouring earlier categories; falls back to
 * `others` so unclassifiable items stay visible and auditable instead of
 * silently becoming fashion.
 *
 * Keywords use whole-word matching (word boundaries) so, e.g., `meja` does not
 * falsely match the "meja" inside "kemeja".
 */
export function mapCategory(text: string, fallback: ProductCategory = 'others'): ProductCategory {
  const haystack = text.toLowerCase();
  if (!haystack) return fallback;

  for (const category of ORDER) {
    for (const keyword of keywords[category]) {
      const re = new RegExp(`\\b${escapeRegExp(keyword)}\\b`);
      if (re.test(haystack)) return category;
    }
  }
  return fallback;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}