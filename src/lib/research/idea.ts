/**
 * Tahap ideation workflow otomatis: riset mekanisme produk dulu (Tavily),
 * lalu LLM generate ide agar parameter riset discovery lebih lengkap.
 *
 * Desain:
 * - Fail-soft berlapis: Tavily gagal → LLM-only dari nama produk;
 *   LLM gagal/output invalid → null (pemanggil lanjut perilaku lama).
 * - Validasi output mirror `researchSchema` di content/actions.ts —
 *   prompt hanya lapis pertahanan pertama, kode yang final.
 * - Pure + injectable (provider/LLM via parameter) agar unit-testable
 *   tanpa network/DB.
 */
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSearchProvider, type SearchProvider, type SearchResult } from './search';
import { buildIdeaPrompt, type IdeaInput } from './prompts';
import { runLLMCompletion } from '@/lib/llm/completion';

export interface IdeaProduct {
  id: string;
  friendly_code: string | null;
  name_id: string;
  name_en: string | null;
  category: string | null;
  merchant: string | null;
  url: string | null;
}

/** Hint operator dari config automation (nilai operator = hint, bukan final). */
export interface IdeaConfigHints {
  language: string;
  tone: string;
  audience: string;
  purpose: string;
  ctaStyle: string;
  templateSlug: string | null;
  targetReplyCount?: number | null;
}

/** Hasil ide yang lolos validasi — siap ditulis ke baris sesi riset baru. */
export interface GeneratedIdea {
  topic: string;
  keywords: string | null;
  targetCategory: string | null;
  audience: string | null;
  audienceInterests: string[] | null;
  audienceAge: string | null;
  targetLocation: string | null;
  accountGoal: string | null;
  purpose: string | null;
  tone: string | null;
  ctaStyle: string | null;
}

const VALID_CATEGORIES = new Set([
  'automotive',
  'electronics',
  'home-living',
  'fashion',
  'sports-hobby',
  'others'
]);
const VALID_TONES = new Set(['casual', 'formal', 'witty', 'professional', 'friendly', 'edukatif']);

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  return s.slice(0, max);
}

/**
 * Validasi mentah output LLM → GeneratedIdea, atau null bila tidak layak.
 * Mirror batas `researchSchema` (actions.ts): topic 10–500, audience/purpose
 * 3–200, keywords ≤200; enum targetCategory/tone harus valid.
 */
export function parseIdeaOutput(raw: unknown): GeneratedIdea | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const topic = str(o.topic, 500);
  if (!topic || topic.length < 10) return null;
  const audience = str(o.audience, 200);
  if (audience !== null && audience.length < 3) return null;
  const purpose = str(o.purpose, 200);
  if (purpose !== null && purpose.length < 3) return null;
  const targetCategory = str(o.targetCategory, 40);
  if (targetCategory !== null && !VALID_CATEGORIES.has(targetCategory)) return null;
  const tone = str(o.tone, 20);
  if (tone !== null && !VALID_TONES.has(tone)) return null;
  const interestsRaw = o.audienceInterests;
  const interests = Array.isArray(interestsRaw)
    ? interestsRaw.map((x) => String(x).trim()).filter(Boolean)
    : typeof interestsRaw === 'string'
      ? interestsRaw.split(',').map((s) => s.trim()).filter(Boolean)
      : null;
  return {
    topic,
    keywords: str(o.keywords, 200),
    targetCategory,
    audience,
    audienceInterests: interests && interests.length > 0 ? interests : null,
    audienceAge: str(o.audienceAge, 60),
    targetLocation: str(o.targetLocation, 120),
    accountGoal: str(o.accountGoal, 200),
    purpose,
    tone,
    ctaStyle: str(o.ctaStyle, 60)
  };
}

/** Parse teks LLM (strip fence + fallback blok objek) → GeneratedIdea|null. */
export function parseIdeaText(text: string): GeneratedIdea | null {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return parseIdeaOutput(JSON.parse(cleaned) as unknown);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return parseIdeaOutput(JSON.parse(m[0]) as unknown);
    } catch {
      return null;
    }
  }
}

/**
 * Riset mekanisme produk via Tavily: 2 query hemat
 * (nama+merchant, nama+kategori/use-case) + best-effort extract URL produk.
 * Gagal total → null (pemanggil lanjut LLM-only). Tidak pernah melempar.
 */
export async function researchProductMechanism(
  provider: SearchProvider,
  product: IdeaProduct
): Promise<string | null> {
  try {
    const queries: string[] = [];
    if (product.merchant) queries.push(`${product.name_id} ${product.merchant}`);
    queries.push(
      product.category
        ? `${product.name_id} ${product.category} kegunaan`
        : `${product.name_id} kegunaan review`
    );
    const settled = await Promise.allSettled(
      queries.slice(0, 2).map((q) => provider.search(q, { maxResults: 5, topic: 'general' }))
    );
    const results: SearchResult[] = settled
      .filter((r): r is PromiseFulfilledResult<SearchResult[]> => r.status === 'fulfilled')
      .flatMap((r) => r.value);
    // Best-effort: extract halaman produk bila URL http(s) (sering diblokir
    // bot — gagal = lanjut dengan snippets search saja).
    let extracted: SearchResult[] = [];
    if (product.url && /^https?:\/\//i.test(product.url)) {
      try {
        extracted = (
          await provider.extract([product.url], { query: product.name_id, maxChars: 1500 })
        ).filter((p) => p.content.trim().length > 100);
      } catch {
        extracted = [];
      }
    }
    const chunks: string[] = [];
    for (const p of extracted.slice(0, 1)) {
      chunks.push(`[Halaman produk] ${p.title}\n${p.content.slice(0, 1500)}`);
    }
    const seen = new Set<string>();
    for (const r of results) {
      const key = `${r.url}|${r.title.toLowerCase().slice(0, 60)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      chunks.push(`[${r.title}] ${r.content.slice(0, 300)} (${r.url})`);
      if (chunks.join('\n\n').length > 2000) break;
    }
    if (chunks.length === 0) return null;
    return chunks.join('\n\n').slice(0, 2000);
  } catch {
    return null;
  }
}

/**
 * Anti-ulang: topik sesi mekanisme dua untuk produk ini dalam N hari
 * terakhir (batas 10) → negative examples. Gagal query → [] (tak blokir).
 */
export async function fetchRecentProductTopics(
  supabase: SupabaseClient,
  productId: string,
  sinceDays = 14,
  limit = 10
): Promise<string[]> {
  try {
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
    const { data: links } = await supabase
      .from('content_research_session_products')
      .select('session_id, content_research_sessions!inner(created_at, mechanism)')
      .eq('product_id', productId)
      .gte('content_research_sessions.created_at', since);
    const sessionIds = (
      (links ?? []) as Array<{
        session_id: string;
        content_research_sessions:
          | { created_at: string; mechanism: string | null }
          | Array<{ created_at: string; mechanism: string | null }>
          | null;
      }>
    )
      .filter((l) => {
        const j = l.content_research_sessions;
        const row = Array.isArray(j) ? j[0] : j;
        return row?.mechanism === 'dua';
      })
      .map((l) => l.session_id);
    if (sessionIds.length === 0) return [];
    const { data: sessions } = await supabase
      .from('content_research_sessions')
      .select('topic')
      .in('id', sessionIds)
      .order('created_at', { ascending: false });
    return ((sessions ?? []) as Array<{ topic: string | null }>)
      .map((s) => s.topic?.trim() ?? '')
      .filter(Boolean)
      .slice(0, limit);
  } catch {
    return [];
  }
}

export interface IdeaDeps {
  searchProvider: SearchProvider | null;
  runCompletion: typeof runLLMCompletion;
  resolveIdeaModel: () => Promise<{ providerId: string | null; modelUuid: string | null }>;
}

/** Default deps produksi: Tavily (throw bila key hilang → fail-soft di caller). */
export async function defaultIdeaDeps(supabase: SupabaseClient): Promise<IdeaDeps | null> {
  let searchProvider: SearchProvider | null = null;
  try {
    searchProvider = await getSearchProvider(supabase);
  } catch {
    searchProvider = null;
  }
  return {
    searchProvider,
    runCompletion: runLLMCompletion,
    resolveIdeaModel: async () => {
      try {
        const { resolveStageModel } = await import('@/lib/llm/stage-defaults');
        return await resolveStageModel('idea_generation', null);
      } catch {
        return { providerId: null, modelUuid: null };
      }
    }
  };
}

/**
 * Generate 1 ide untuk produk: riset mekanisme → prompt → LLM → validasi.
 * Kembalikan null bila tahap mana pun gagal/invalid (pemanggil memakai
 * perilaku lama: topic null + hint config). Tidak pernah melempar.
 */
export async function generateSessionIdea(
  supabase: SupabaseClient,
  product: IdeaProduct,
  hints: IdeaConfigHints,
  templateHint: string | null,
  deps: IdeaDeps
): Promise<GeneratedIdea | null> {
  try {
    const mechanismContext = deps.searchProvider
      ? await researchProductMechanism(deps.searchProvider, product)
      : null;
    const recentTopics = await fetchRecentProductTopics(supabase, product.id);
    const varietySeed = `${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffff).toString(16)}`;
    const promptInput: IdeaInput = {
      productName: product.name_id,
      productCategory: product.category,
      productMerchant: product.merchant,
      productUrl: product.url,
      mechanismContext,
      language: hints.language,
      tone: hints.tone,
      audience: hints.audience,
      purpose: hints.purpose,
      ctaStyle: hints.ctaStyle,
      templateHint,
      recentTopics,
      varietySeed
    };
    const { system, user } = buildIdeaPrompt(promptInput);
    const ideaModel = await deps.resolveIdeaModel();
    const result = await deps.runCompletion(supabase, {
      requestId: null,
      sessionId: null,
      stage: 'idea_generation',
      providerId: ideaModel.providerId,
      modelUuid: ideaModel.modelUuid,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature: 1.0,
      maxTokens: 900
    });
    return parseIdeaText(result.output.text);
  } catch {
    return null;
  }
}
