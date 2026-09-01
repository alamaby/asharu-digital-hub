import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
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
  queries.push(`berita terbaru ${target} ${new Date().toISOString().slice(0, 10)}`);
  queries.push(`tren ${target} hari ini`);
  if (input.audienceInterests.length > 0) {
    queries.push(`${input.audienceInterests.slice(0, 2).join(' ')} viral ${target}`);
  }
  queries.push(`tips praktis ${input.platform} ${target}`);
  queries.push(`cerita inspiratif ${target}`);
  for (const cat of input.allowedCategories.slice(0, 2)) {
    queries.push(`${cat} terbaru ${target}`);
  }
  return queries;
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
  // Cap at 10 results to keep the prompt manageable for smaller models
  // (25 results × 600 chars overwhelmed nemotron-3-ultra → empty output).
  return results.slice(0, 10);
}

export interface DiscoveryRunResult {
  topics: DiscoveryTopicRow[];
  searchSummary: DiscoveryLLMOutput['search_summary'];
}

export async function runDiscovery(
  supabase: SupabaseClient,
  sessionId: string,
  input: DiscoveryInput
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
  const chunked = chunkSourcesForLLM(deduped);

  await supabase.from('content_research_logs').insert({
    session_id: sessionId,
    stage: 'discovering',
    level: 'info',
    message: `search complete: ${rawResults.length} raw, ${deduped.length} deduped, sent ${chunked.length} to LLM`
  });

  const { system, user } = buildDiscoveryPrompt(input, chunked);
  const result = await runLLMCompletion(supabase, {
    requestId: sessionId,
    stage: 'discovering',
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
    message: `LLM raw output (first 500 chars): ${result.output.text.slice(0, 500)}`
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
