import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { extractUrls } from '@/lib/utils/urls';
import { getSearchProvider, type SearchResult } from './search';
import { buildDiscoveryPrompt } from './prompts';
import type { DiscoveryInput } from './prompts';
import { runLLMCompletion } from '@/lib/llm/completion';

export interface DiscoveryTopicRow {
  topic: string;
  category: string;
  why_now: string;
  audience_relevance: string;
  key_facts: string[];
  unique_angle: string;
  hooks: Array<{ type: string; text: string }>;
  recommended_format: string;
  recommended_platform: string[];
  potential_risk: string;
  sources: Array<{ title: string; publisher?: string; published_at?: string; url: string }>;
  score_breakdown: {
    freshness: number;
    local_relevance: number;
    practical_value: number;
    curiosity: number;
    emotional_resonance: number;
    credibility: number;
    conversation_potential: number;
    brand_relevance: number;
    penalty: number;
    final_score: number;
  };
  verification_status: 'pending' | 'verified' | 'unverified' | 'rejected';
}

interface DiscoveryLLMOutput {
  research_time?: string;
  target_audience?: string;
  search_summary?: {
    queries_used: string[];
    sources_reviewed?: number;
    candidates_found?: number;
    iterations_completed?: number;
  };
  recommended_topics: DiscoveryTopicRow[];
  rejected_topics?: Array<{ topic: string; reason: string }>;
}

function buildQueries(input: DiscoveryInput): string[] {
  const queries: string[] = [];
  const target = input.targetLocation || 'Indonesia';
  const audience = (input as unknown as { audience?: string | null }).audience ?? input.audienceAge;
  const keywords = (input as unknown as { keywords?: string | null }).keywords ?? null;
  const targetCategory = (input as unknown as { targetCategory?: string | null }).targetCategory ?? null;
  const topicHint = (input as unknown as { topicHint?: string | null }).topicHint ?? null;

  // Audience-first queries (dynamic from user input, not hardcoded Gen Z)
  if (topicHint) {
    queries.push(`${topicHint} ${target}`);
  }
  if (targetCategory) {
    queries.push(`${targetCategory} tren ${target} untuk ${audience}`);
  }
  if (keywords) {
    queries.push(`${keywords} tips untuk ${audience} di ${target}`);
  }
  // Use all interests, not just 2
  for (const interest of input.audienceInterests.slice(0, 3)) {
    queries.push(`${interest} untuk ${audience} di ${target}`);
    if (targetCategory) queries.push(`${interest} ${targetCategory} terbaru`);
  }
  if (input.allowedCategories.length > 0) {
    for (const cat of input.allowedCategories.slice(0, 3)) {
      queries.push(`${cat} untuk ${audience} ${target}`);
    }
  } else if (!targetCategory) {
    // Fallback to account goal keywords when no category given
    queries.push(`${input.accountGoal} ${target}`);
  }
  // Platform-specific
  if (input.platform && input.platform !== 'all') {
    queries.push(`tips praktis ${input.platform} untuk ${audience} ${target}`);
  } else {
    queries.push(`tips praktis untuk ${audience} ${target}`);
  }
  // Generic fallbacks last (low priority)
  queries.push(`tren ${target} hari ini`);
  queries.push(`berita terbaru ${target} ${new Date().toISOString().slice(0, 10)}`);
  // Deduplicate preserve audience-first order, cap 8 queries
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const q of queries) {
    const k = q.toLowerCase().trim();
    if (k && !seen.has(k)) {
      seen.add(k);
      deduped.push(q);
    }
    if (deduped.length >= 8) break;
  }
  return deduped;
}

function dedupResults(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  const out: SearchResult[] = [];
  for (const r of results) {
    let host = '';
    try {
      host = new URL(r.url).hostname.replace(/^www\./, '');
    } catch {
      host = r.url;
    }
    const key = `${host}|${r.title.toLowerCase().slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function chunkSourcesForLLM(results: SearchResult[]): SearchResult[] {
  // Cap at 15 results with richer content (500 chars) — audience-first queries already filtered
  // Keep manageable for bynara 9 models with max reasoning; prior 10×300 was too lossy for niche.
  return results.slice(0, 15);
}

export interface DiscoveryRunResult {
  topics: DiscoveryTopicRow[];
  searchSummary: DiscoveryLLMOutput['search_summary'];
}

export async function runDiscovery(
  supabase: SupabaseClient,
  sessionId: string,
  input: DiscoveryInput,
  pinnedModelId?: string | null
): Promise<DiscoveryRunResult> {
  const provider = await getSearchProvider(supabase);
  const queries = buildQueries(input);
  const timeRange =
    input.freshnessHours <= 24 ? 'day' : input.freshnessHours <= 168 ? 'week' : 'month';
  const settled = await Promise.allSettled(
    queries.map((q) =>
      provider.search(q, {
        maxResults: 8,
        topic: input.freshnessHours <= 48 ? 'news' : 'general',
        timeRange,
        includeRawContent: false
      })
    )
  );
  const rawResults: SearchResult[] = settled
    .filter((r): r is PromiseFulfilledResult<SearchResult[]> => r.status === 'fulfilled')
    .flatMap((r) => r.value);
  const deduped = dedupResults(rawResults);

  // Jika user paste link di topik/keywords, telusuri isinya dan prioritaskan
  // sebagai sumber utama LLM (best-effort; gagal → lanjut search biasa).
  let pastedResults: SearchResult[] = [];
  const pastedUrls = extractUrls(`${input.topicHint ?? ''} ${input.keywords ?? ''}`);
  if (pastedUrls.length > 0) {
    try {
      pastedResults = (
        await provider.extract(pastedUrls.slice(0, 2), { query: input.topicHint ?? input.keywords ?? undefined })
      )
        .filter((p) => p.content.trim().length > 100)
        .map((p) => ({ ...p, title: `[LINK USER] ${p.title}` }));
      await supabase.from('content_research_logs').insert({
        session_id: sessionId,
        stage: 'discovering',
        level: 'info',
        message: `pasted link extract: ${pastedResults.length}/${pastedUrls.length} halaman berhasil diambil`
      });
    } catch (e) {
      await supabase.from('content_research_logs').insert({
        session_id: sessionId,
        stage: 'discovering',
        level: 'warn',
        message: `pasted link extract gagal, lanjut search biasa: ${e instanceof Error ? e.message : String(e)}`
      });
    }
  }
  const chunked = [...pastedResults, ...chunkSourcesForLLM(deduped)];

  await supabase.from('content_research_logs').insert({
    session_id: sessionId,
    stage: 'discovering',
    level: 'info',
    message: `search complete: ${rawResults.length} raw, ${deduped.length} deduped, ${pastedResults.length} pasted, sent ${chunked.length} to LLM`
  });

  const { system, user } = buildDiscoveryPrompt(input, chunked);
  let discoveryModel: { providerId: string | null; modelUuid: string | null } = { providerId: null, modelUuid: null };
  if (pinnedModelId) {
    const { data: m } = await supabase.from('llm_models').select('id, provider_id, is_active').eq('id', pinnedModelId).eq('is_active', true).maybeSingle();
    const mr = m as { id: string; provider_id: string; is_active: boolean } | null;
    if (mr) discoveryModel = { providerId: mr.provider_id, modelUuid: mr.id };
  } else {
    try {
      const { resolveStageModel } = await import('@/lib/llm/stage-defaults');
      discoveryModel = await resolveStageModel('discovering', null);
    } catch { void 0; }
  }
  const result = await runLLMCompletion(supabase, {
    requestId: null,
    sessionId,
    stage: 'discovering',
    providerId: discoveryModel.providerId,
    modelUuid: discoveryModel.modelUuid,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature: 0.5
  });

  // Log raw LLM output (truncated) for debugging field-mapping issues.
  await supabase.from('content_research_logs').insert({
    session_id: sessionId,
    stage: 'discovering',
    level: 'info',
    message: `LLM raw output (first 2000 chars): ${result.output.text.slice(0, 2000)}`
  });

  const parsed = parseDiscoveryOutput(result.output.text);
  await supabase.from('content_research_logs').insert({
    session_id: sessionId,
    stage: 'discovering',
    level: 'info',
    message: `parsed ${parsed.topics.length} topics; first topic field: "${parsed.topics[0]?.topic ?? '(none)'}"`
  });
  if (parsed.topics.length > 0) {
    await supabase.from('content_research_topics').insert(
      parsed.topics.map((t, i) => ({
        session_id: sessionId,
        rank: i + 1,
        topic: t.topic,
        category: t.category,
        why_now: t.why_now,
        audience_relevance: t.audience_relevance,
        key_facts: t.key_facts,
        unique_angle: t.unique_angle,
        hooks: t.hooks,
        recommended_format: t.recommended_format,
        recommended_platform: t.recommended_platform,
        potential_risk: t.potential_risk,
        verification_status: t.verification_status,
        sources: t.sources,
        score_breakdown: t.score_breakdown,
        final_score: t.score_breakdown.final_score,
        status: 'pending'
      }))
    );
  }
  return { topics: parsed.topics, searchSummary: parsed.searchSummary };
}

/** Coerce a value to string, defaulting to '' for null/undefined. */
function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

/** Pick the first non-empty string from a list of candidate field names. */
function pickStr(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim().length > 0) return v;
  }
  return '';
}

/** Coerce to string[], defaulting to []. */
function strArr(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => str(x));
  if (typeof v === 'string' && v.trim()) return [v.trim()];
  return [];
}

/** Coerce to object array, defaulting to []. */
function objArr(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  return [];
}

const EMPTY_SCORE_BREAKDOWN = {
  freshness: 0, local_relevance: 0, practical_value: 0, curiosity: 0,
  emotional_resonance: 0, credibility: 0, conversation_potential: 0,
  brand_relevance: 0, penalty: 0, final_score: 0
} as const;

function normalizeTopic(raw: unknown): DiscoveryTopicRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Record<string, unknown>;
  const topicText = pickStr(t, 'topic', 'title', 'name', 'subject', 'headline', 'description');
  if (!topicText) return null;
  const rawScore = (t.score_breakdown ?? t.score ?? t.scores ?? {}) as Record<string, unknown>;
  const hooksRaw = objArr(t.hooks).map((h) => {
    if (typeof h === 'string') return { type: 'generic', text: h };
    const ho = h as Record<string, unknown>;
    return {
      type: str(ho.type ?? ho.style ?? 'generic'),
      text: pickStr(ho, 'text', 'hook', 'content', 'value')
    };
  }).filter((h) => h.text);
  const sourcesRaw = objArr(t.sources ?? t.references ?? t.links ?? []).map((s) => {
    const so = typeof s === 'string' ? { url: s } : (s as Record<string, unknown>);
    return {
      title: pickStr(so, 'title', 'name'),
      publisher: pickStr(so, 'publisher', 'site', 'source'),
      published_at: pickStr(so, 'published_at', 'date', 'publishedDate'),
      url: pickStr(so, 'url', 'link', 'href')
    };
  }).filter((s) => s.url || s.title);
  return {
    topic: topicText,
    category: pickStr(t, 'category', 'type', 'tag'),
    why_now: pickStr(t, 'why_now', 'whyNow', 'relevance', 'rationale'),
    audience_relevance: pickStr(t, 'audience_relevance', 'audienceRelevance', 'audience'),
    key_facts: strArr(t.key_facts ?? t.facts ?? t.keyFacts),
    unique_angle: pickStr(t, 'unique_angle', 'uniqueAngle', 'angle', 'perspective'),
    hooks: hooksRaw,
    recommended_format: pickStr(t, 'recommended_format', 'format', 'recommendedFormat'),
    recommended_platform: strArr(t.recommended_platform ?? t.platforms ?? t.recommendedPlatform),
    potential_risk: pickStr(t, 'potential_risk', 'risk', 'potentialRisk', 'warning'),
    verification_status: (pickStr(t, 'verification_status', 'verificationStatus') || 'pending') as DiscoveryTopicRow['verification_status'],
    sources: sourcesRaw,
    score_breakdown: { ...EMPTY_SCORE_BREAKDOWN, ...rawScore } as DiscoveryTopicRow['score_breakdown'],
  };
}

function parseDiscoveryOutput(text: string): DiscoveryRunResult {
  const trimmed = text.replace(/^```(?:json)?/i, '').replace(/```\s*$/i, '').trim();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(trimmed);
  } catch {
    const m = trimmed.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Discovery LLM did not return valid JSON');
    data = JSON.parse(m[0]);
  }
  // The LLM may nest topics under different keys; try the common ones.
  const rawTopics = objArr(
    data.recommended_topics ?? data.topics ?? data.results ?? data.candidates ?? []
  );
  const topics = rawTopics
    .map(normalizeTopic)
    .filter((t): t is DiscoveryTopicRow => t !== null);
  const searchSummary = (data.search_summary ?? data.summary ?? undefined) as DiscoveryLLMOutput['search_summary'];
  return { topics, searchSummary };
}
