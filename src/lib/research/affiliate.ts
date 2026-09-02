import type { SupabaseClient } from '@supabase/supabase-js';

export interface AffiliateProductRow {
  id: string;
  friendly_code: string;
  external_id: string;
  name_id: string;
  name_en: string;
  category: string;
  merchant: string;
  url: string;
  image: string;
}

export interface AffiliateMatchSignals {
  category_match: boolean;
  keyword_overlap: number;
  scored_from_pool_size: number;
  no_recent_products?: boolean;
}

export interface SelectedAffiliate {
  product: AffiliateProductRow;
  matchScore: number;
  signals: AffiliateMatchSignals;
}

export interface TopicForMatching {
  topic: string;
  category?: string | null;
  unique_angle?: string | null;
  key_facts?: string[];
  hooks?: Array<{ type: string; text: string }>;
}

const CATEGORY_MATCH_BONUS = 50;
const CATEGORY_PARTIAL_BONUS = 25;
const KEYWORD_OVERLAP_BONUS = 3;
const KEYWORD_MIN_LENGTH = 4;
const POOL_SIZE = 50;
const RELEVANCE_HIGH = 50;
const RELEVANCE_MEDIUM = 10;
const MIN_ACCEPTABLE_SCORE = 6;

/**
 * Select the most relevant active affiliate product for a topic, from the
 * most recently added 20 products. Returns null + signals.no_recent_products
 * if the pool is empty.
 */
export async function selectAffiliateProduct(
  supabase: SupabaseClient,
  topic: TopicForMatching
): Promise<SelectedAffiliate | null> {
  const { data: pool, error } = await supabase
    .from('affiliate_products')
    .select('id, friendly_code, external_id, name_id, name_en, category, merchant, url, image')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(POOL_SIZE);
  if (error) throw new Error(`affiliate pool query: ${error.message}`);
  if (!pool || pool.length === 0) {
    return null;
  }
  const products = pool as AffiliateProductRow[];

  const topicCategory = (topic.category ?? '').toLowerCase().trim();
  const topicText = buildTopicText(topic).toLowerCase();
  const topicKeywords = topicText
    .split(/\W+/)
    .filter((w) => w.length >= KEYWORD_MIN_LENGTH);
  const uniqueKeywords = Array.from(new Set(topicKeywords));

  let bestScore = -1;
  let best: AffiliateProductRow | null = null;
  let bestSignals: AffiliateMatchSignals | null = null;
  for (const product of products) {
    const productCategory = (product.category ?? '').toLowerCase().trim();
    let score = 0;
    let categoryMatch = false;
    if (topicCategory) {
      if (productCategory === topicCategory) {
        score += CATEGORY_MATCH_BONUS;
        categoryMatch = true;
      } else if (productCategory && productCategory.includes(topicCategory)) {
        score += CATEGORY_PARTIAL_BONUS;
        categoryMatch = true;
      }
    }
    const productText = `${product.name_id} ${product.name_en} ${product.category} ${product.merchant}`.toLowerCase();
    const overlap = uniqueKeywords.filter((w) => productText.includes(w)).length;
    score += overlap * KEYWORD_OVERLAP_BONUS;
    // Pool is ordered newest-first, so strict `>` keeps the most recent
    // product on ties — including the all-zero case (first product wins).
    if (score > bestScore) {
      bestScore = score;
      best = product;
      bestSignals = {
        category_match: categoryMatch,
        keyword_overlap: overlap,
        scored_from_pool_size: products.length
      };
    }
  }
  if (!best || !bestSignals || bestScore < MIN_ACCEPTABLE_SCORE) {
    return null;
  }
  return {
    product: best,
    matchScore: bestScore,
    signals: bestSignals
  };
}

export function relevanceBand(score: number | null): 'high' | 'medium' | 'low' | 'none' {
  if (score === null || score === undefined) return 'none';
  if (score >= RELEVANCE_HIGH) return 'high';
  if (score >= RELEVANCE_MEDIUM) return 'medium';
  return 'low';
}

function buildTopicText(topic: TopicForMatching): string {
  const parts: string[] = [topic.topic];
  if (topic.unique_angle) parts.push(topic.unique_angle);
  if (topic.key_facts && topic.key_facts.length > 0) parts.push(...topic.key_facts);
  if (topic.hooks && topic.hooks.length > 0) parts.push(...topic.hooks.map((h) => h.text));
  return parts.join(' ');
}
