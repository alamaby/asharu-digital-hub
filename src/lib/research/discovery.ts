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
  // Mekanisme dua: turunkan query dari produk tetap agar search relevan
  // dengan konten yang harus menyisipkannya.
  const fixedProducts = (input as unknown as { fixedProducts?: Array<{ name?: string | null; category?: string | null }> }).fixedProducts ?? [];
  for (const p of fixedProducts.slice(0, 2)) {
    if (p.name) queries.push(`${p.name} tips ${target}`);
    if (p.category) queries.push(`${p.category} tren ${target} untuk ${audience}`);
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

function chunkSourcesForLLM(results: SearchResult[], topicHint?: string | null): SearchResult[] {
  // Cap at 15 results with richer content (500 chars) — audience-first queries already filtered
  // Keep manageable for bynara 9 models with max reasoning; prior 10×300 was too lossy for niche.
  // Fix 4e03bde2: prioritaskan chunk yang match topicHint user agar konteks niche
  // (mis. coffee maker portable) tidak tenggelam di generic fallback.
  if (topicHint && topicHint.trim().length > 3) {
    const keywords = topicHint.toLowerCase().split(/[\s,;]+/).filter((w) => w.length > 3).slice(0, 6);
    if (keywords.length > 0) {
      const scored = results.map((r, i) => {
        const hay = `${r.title} ${r.content}`.toLowerCase();
        let hits = 0;
        for (const k of keywords) if (hay.includes(k)) hits++;
        return { r, hits, i };
      });
      scored.sort((a, b) => b.hits - a.hits || a.i - b.i);
      return scored.map((s) => s.r).slice(0, 15);
    }
  }
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
  const searchStarted = Date.now();
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
  const searchLatency = Date.now() - searchStarted;
  const failedQueries = settled.filter((r) => r.status === 'rejected').length;
  // Audit search generik (best-effort; gagal log ≠ gagal riset).
  try {
    await supabase.from('search_call_logs').insert({
      session_id: sessionId,
      provider_slug: provider.name,
      operation: 'search',
      queries,
      query_count: queries.length,
      latency_ms: searchLatency,
      result_count: rawResults.length,
      http_status: failedQueries === queries.length ? 500 : 200,
      error:
        failedQueries === queries.length
          ? String((settled[0] as PromiseRejectedResult)?.reason ?? 'all search queries failed').slice(0, 2000)
          : failedQueries > 0
            ? `${failedQueries}/${queries.length} queries failed`.slice(0, 2000)
            : null,
      request_payload: { timeRange, topic: input.freshnessHours <= 48 ? 'news' : 'general', maxResults: 8 },
      response_summary: {
        deduped: deduped.length,
        top: deduped.slice(0, 3).map((r) => ({ title: r.title.slice(0, 120), url: r.url }))
      }
    } as unknown as Record<string, unknown>);
  } catch {
    /* audit-only */
  }

  // Jika user paste link di topik/keywords, telusuri isinya dan prioritaskan
  // sebagai sumber utama LLM (best-effort; gagal → lanjut search biasa).
  let pastedResults: SearchResult[] = [];
  const pastedUrls = extractUrls(`${input.topicHint ?? ''} ${input.keywords ?? ''}`);
  if (pastedUrls.length > 0) {
    const extractStarted = Date.now();
    try {
      pastedResults = (
        await provider.extract(pastedUrls.slice(0, 2), { query: input.topicHint ?? input.keywords ?? undefined })
      )
        .filter((p) => p.content.trim().length > 100)
        .map((p) => ({ ...p, title: `[LINK USER] ${p.title}` }));
      try {
        await supabase.from('search_call_logs').insert({
          session_id: sessionId,
          provider_slug: provider.name,
          operation: 'extract',
          queries: pastedUrls.slice(0, 2),
          query_count: Math.min(pastedUrls.length, 2),
          latency_ms: Date.now() - extractStarted,
          result_count: pastedResults.length,
          http_status: 200,
          request_payload: { query: input.topicHint ?? input.keywords ?? null },
          response_summary: { extracted: pastedResults.length }
        } as unknown as Record<string, unknown>);
      } catch {
        /* audit-only */
      }
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
  const chunked = [...pastedResults, ...chunkSourcesForLLM(deduped, input.topicHint)];

  await supabase.from('content_research_logs').insert({
    session_id: sessionId,
    stage: 'discovering',
    level: 'info',
    message: `search complete: ${rawResults.length} raw, ${deduped.length} deduped, ${pastedResults.length} pasted, sent ${chunked.length} to LLM`
  });
  if (chunked.length === 0) {
    throw new Error(
      `Tavily tidak mengembalikan hasil (raw ${rawResults.length}, gagal ${failedQueries}/${queries.length}). Cek API key / kuota di log Search, lalu ulangi riset.`
    );
  }

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
  async function runOnce(passInput: DiscoveryInput, temperature: number) {
    const { system: sys, user: usr } = buildDiscoveryPrompt(passInput, chunked);
    const out = await runLLMCompletion(supabase, {
      requestId: null,
      sessionId,
      stage: 'discovering',
      providerId: discoveryModel.providerId,
      modelUuid: discoveryModel.modelUuid,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: usr }
      ],
      temperature,
      maxTokens: 4000
    });
    const rawLen = out.output.text.length;
    // Log raw LLM output (truncated) for debugging field-mapping issues.
    await supabase.from('content_research_logs').insert({
      session_id: sessionId,
      stage: 'discovering',
      level: 'info',
      message: `LLM raw output (${rawLen} chars, ${out.providerSlug}/${out.model}, fallback=${out.fallback ? 'yes' : 'no'}; first 2000 chars): ${out.output.text.slice(0, 2000)}`
    });
    const parsedOnce = parseDiscoveryOutput(out.output.text);
    await supabase.from('content_research_logs').insert({
      session_id: sessionId,
      stage: 'discovering',
      level: 'info',
      message: `parsed ${parsedOnce.topics.length} topics; first topic field: "${parsedOnce.topics[0]?.topic ?? '(none)'}"`
    });
    return parsedOnce;
  }

  const parsed = await runOnce(input, 0.5);
  const allTopics = parsed.topics;
  let searchSummary = parsed.searchSummary;

  // Second-pass (cap 1x, reuse chunk search yang sama — tanpa cost Tavily ekstra):
  // bila pass pertama < requiredWinners (default 3), panggil LLM sekali lagi
  // dengan filter dilonggarkan (isRetryPass) lalu merge dedup. Fix 4e03bde2: 1 topik.
  const need = input.requiredWinners ?? 3;
  if (!input.isRetryPass && allTopics.length < need) {
    await supabase.from('content_research_logs').insert({
      session_id: sessionId,
      stage: 'discovering',
      level: 'warn',
      message: `first pass only ${allTopics.length}/${need} topics; retry with relaxed filter (reuse ${chunked.length} sources, no extra search)`
    });
    const retryInput: DiscoveryInput = {
      ...input,
      isRetryPass: true,
      allowedCategories: [],
      freshnessHours: Math.max(input.freshnessHours, 168)
    };
    const retryParsed = await runOnce(retryInput, 0.7);
    const seen = new Set(allTopics.map((t) => t.topic.toLowerCase().trim()));
    let added = 0;
    for (const t of retryParsed.topics) {
      const k = t.topic.toLowerCase().trim();
      if (k && !seen.has(k)) {
        seen.add(k);
        allTopics.push(t);
        added++;
      }
    }
    if (retryParsed.searchSummary && !searchSummary) searchSummary = retryParsed.searchSummary;
    await supabase.from('content_research_logs').insert({
      session_id: sessionId,
      stage: 'discovering',
      level: 'info',
      message: `retry merged: +${added} topics, total ${allTopics.length}`
    });
  }

  if (allTopics.length > 0) {
    await supabase.from('content_research_topics').insert(
      allTopics.map((t, i) => ({
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
  return { topics: allTopics, searchSummary };
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
  // Strip markdown fences robustly (```json ... ``` possibly multiline).
  const trimmed = text
    .replace(/^[\s\S]*?```(?:json)?\s*/i, (m) => (m.includes('```') ? '' : m))
    .replace(/```[\s\S]*$/i, '')
    .trim();
  if (!trimmed) {
    throw new Error(
      `Discovery LLM returned empty response (${text.length} chars). Provider mungkin truncate / response_format tidak didukung — fallback otomatis akan mencoba model lain.`
    );
  }
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(trimmed);
  } catch {
    const extracted = extractLargestJson(trimmed);
    if (!extracted) {
      throw new Error(
        `Discovery LLM did not return valid JSON (${trimmed.length} chars, preview: ${trimmed.slice(0, 200)}). Cek log LLM raw output.`
      );
    }
    try {
      data = JSON.parse(extracted);
    } catch {
      throw new Error(
        `Discovery LLM did not return valid JSON (${trimmed.length} chars, preview: ${trimmed.slice(0, 200)}). Cek log LLM raw output.`
      );
    }
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

/** Ambil blok JSON terbesar (brace-matched) agar prefix/suffix reasoning tidak merusak parse. */
function extractLargestJson(s: string): string | null {
  let best: string | null = null;
  let depth = 0;
  let start = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        const cand = s.slice(start, i + 1);
        if (!best || cand.length > best.length) best = cand;
        start = -1;
      }
      if (depth < 0) depth = 0;
    }
  }
  return best;
}
