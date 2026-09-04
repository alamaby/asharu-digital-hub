import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildThreadPrompt } from '@/lib/llm/prompt';
import { runLLMCompletion } from '@/lib/llm/completion';
import { selectAffiliateWithRandomFallback, type SelectedAffiliate } from './affiliate';
import { parseThread, replacePlaceholders, repositionPlaceholder } from './thread';

interface ShortlistedTopic {
  id: string;
  topic: string;
  category: string | null;
  key_facts: unknown;
  hooks: unknown;
  unique_angle: string | null;
}

// 6 reply konten + 1 reply affiliate di tengah = total EXACTLY 7 untuk Threads/Twitter.
// Reply affiliate dihitung terpisah agar percakapan konten tetap detail (min 6) di luar sisipan produk.
export const CONTENT_REPLIES = 6;
export const TOTAL_REPLIES = CONTENT_REPLIES + 1;

export async function runDevelopment(
  supabase: SupabaseClient,
  sessionId: string,
  pinnedModelId?: string | null
): Promise<void> {
  const { data: session, error: sessionError } = await supabase
    .from('content_research_sessions')
    .select('id, platform_slug, tone, account_goal, audience_age, audience_interests, target_location, target_reply_count')
    .eq('id', sessionId)
    .single();
  if (sessionError || !session) throw new Error('session not found');
  const sess = session as {
    id: string;
    platform_slug: string | null;
    tone: string | null;
    account_goal: string | null;
    audience_age: string | null;
    target_reply_count: number | null;
  };

  const { data: topics, error: topicError } = await supabase
    .from('content_research_topics')
    .select('id, topic, category, key_facts, hooks, unique_angle')
    .eq('session_id', sessionId)
    .eq('status', 'shortlisted')
    .order('rank', { ascending: true });
  if (topicError) throw new Error('topic fetch failed');
  if (!topics || topics.length === 0) {
    await supabase
      .from('content_research_sessions')
      .update({ status: 'failed', error_message: 'no shortlisted topics' })
      .eq('id', sessionId);
    return;
  }
  const allTopics = topics as ShortlistedTopic[];

  const platformSlug = sess.platform_slug ?? 'all';
  let maxChars: number | null = null;
  if (platformSlug === 'all') {
    // Platform-agnostic: use the strictest limit across active platforms so the
    // generated draft is safe to repost on any platform (e.g. Twitter 280).
    const { data: minRow } = await supabase
      .from('platforms')
      .select('max_chars')
      .eq('is_active', true)
      .not('max_chars', 'is', null)
      .order('max_chars', { ascending: true })
      .limit(1)
      .maybeSingle();
    maxChars = (minRow as { max_chars: number | null } | null)?.max_chars ?? 280;
  } else {
    const { data: platformRow } = await supabase
      .from('platforms')
      .select('max_chars')
      .eq('slug', platformSlug)
      .maybeSingle();
    maxChars = (platformRow as { max_chars: number | null } | null)?.max_chars ?? null;
  }
  const platform = {
    slug: platformSlug,
    maxChars
  };

  // Idempotency: skip topics that already have a draft so cron re-picks and
  // inline retries don't produce duplicates.
  const topicIds = allTopics.map((t) => t.id);
  const { data: existingDrafts } = await supabase
    .from('content_drafts')
    .select('research_topic_id')
    .in('research_topic_id', topicIds);
  const doneTopicIds = new Set(
    ((existingDrafts ?? []) as { research_topic_id: string | null }[])
      .map((d) => d.research_topic_id)
      .filter((v): v is string => Boolean(v))
  );
  const pendingTopics = allTopics.filter((t) => !doneTopicIds.has(t.id));

  if (pendingTopics.length === 0) {
    await supabase.from('content_research_logs').insert({
      session_id: sessionId,
      stage: 'developing',
      level: 'info',
      message: `all ${allTopics.length} shortlisted topics already have drafts; nothing to do`
    });
    return;
  }

  for (const topic of pendingTopics) {
    // Select affiliate per-topic: strict scoring first, fallback random dari 20 terbaru jika tidak cocok.
    const affiliate = await selectAffiliateWithRandomFallback(supabase, {
      topic: topic.topic,
      category: topic.category,
      unique_angle: topic.unique_angle,
      key_facts: Array.isArray(topic.key_facts) ? (topic.key_facts as string[]) : undefined,
      hooks: Array.isArray(topic.hooks)
        ? (topic.hooks as Array<{ type: string; text: string }>)
        : undefined
    });

    // Per-topic guard: 1 topik gagal (mis. thread parse failed) tidak boleh
    // menggagalkan seluruh sesi — kumpulkan error, lanjut ke topik berikut.
    try {
      await generateAndInsertDraft(supabase, sessionId, topic.id, platform, sess, topic, affiliate, pinnedModelId);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await supabase.from('content_research_logs').insert({
        session_id: sessionId,
        stage: 'developing',
        level: 'warn',
        message: `topic "${topic.topic.slice(0, 80)}" (${topic.id}) skipped: ${message} — lanjut ke topik berikut`
      });
    }
  }

  // Jika SEMUA topik pending gagal, tandai failed agar admin tahu.
  // Basis: hanya pendingTopics (topik yang dicoba run ini), bukan allTopics.
  const { data: afterDrafts } = await supabase
    .from('content_drafts')
    .select('research_topic_id')
    .in('research_topic_id', pendingTopics.map((t) => t.id));
  const afterDone = new Set(
    ((afterDrafts ?? []) as { research_topic_id: string | null }[])
      .map((d) => d.research_topic_id)
      .filter((v): v is string => Boolean(v))
  );
  const newDraftCount = pendingTopics.filter((t) => afterDone.has(t.id)).length;
  if (newDraftCount <= 0) {
    await supabase
      .from('content_research_sessions')
      .update({ status: 'failed', error_message: `developing: ${pendingTopics.length} topik gagal (lihat log warn per-topik)` })
      .eq('id', sessionId);
  }
}

async function generateAndInsertDraft(
  supabase: SupabaseClient,
  sessionId: string,
  topicId: string,
  platform: { slug: string; maxChars: number | null },
  sess: { tone: string | null; account_goal: string | null; audience_age: string | null; target_reply_count: number | null },
  topic: ShortlistedTopic,
  affiliate: SelectedAffiliate | null,
  pinnedModelId?: string | null
): Promise<void> {
  const tone = sess.tone ?? 'casual';
  const audience = sess.audience_age ?? 'umum';
  const purpose = sess.account_goal ?? 'membagikan informasi bermanfaat';

  const isMultiReplyPlatform = platform.slug === 'threads' || platform.slug === 'twitter' || platform.slug === 'all';
  // Threads/Twitter/"all" (Semua Platform) butuh percakapan detail — jangan fallback ke 0-2/0-3.
  // maxChars untuk "all" tetap 280 (strictest di development.ts:60) agar repost aman,
  // hanya replyCount yang di-EXACTLY 7 (6 konten + 1 affiliate di tengah).
  const targetReplyCount = sess.target_reply_count ?? (isMultiReplyPlatform ? TOTAL_REPLIES : null);

  const topicHooks = Array.isArray(topic.hooks)
    ? (topic.hooks as Array<{ text?: string; type?: string }>).map((h) => h.text ?? '').filter(Boolean)
    : null;
  const topicKeyFacts = Array.isArray(topic.key_facts) ? (topic.key_facts as string[]) : null;

  const promptProduct = affiliate
    ? {
        friendlyCode: affiliate.product.friendly_code,
        name: affiliate.product.name_id,
        url: affiliate.product.url,
        category: affiliate.product.category
      }
    : {
        friendlyCode: 'NONE',
        name: 'tanpa afiliasi',
        url: 'https://example.com',
        category: '-'
      };

  const isFallbackRandom = Boolean(affiliate?.signals.fallback_random);

  const { system, user } = buildThreadPrompt(
    {
      topic: topic.topic,
      platform: { slug: platform.slug, maxChars: platform.maxChars },
      tone,
      audience,
      ctaStyle: 'soft_sell',
      purpose,
      language: 'both',
      targetReplyCount,
      hooks: topicHooks,
      keyFacts: topicKeyFacts,
      uniqueAngle: topic.unique_angle,
      isFallbackRandom
    },
    promptProduct
  );

  // Resolve developing model: pinnedModelId > stage default > global
  let devModel: { providerId: string | null; modelUuid: string | null } = { providerId: null, modelUuid: null };
  if (pinnedModelId) {
    const { data: m } = await supabase.from('llm_models').select('id, provider_id, is_active').eq('id', pinnedModelId).eq('is_active', true).maybeSingle();
    const mr = m as { id: string; provider_id: string; is_active: boolean } | null;
    if (mr) devModel = { providerId: mr.provider_id, modelUuid: mr.id };
  } else {
    try {
      const { resolveStageModel } = await import('@/lib/llm/stage-defaults');
      devModel = await resolveStageModel('developing', null);
    } catch { void 0; }
  }

  const llmResult = await runLLMCompletion(supabase, {
    requestId: null,
    sessionId,
    stage: 'developing',
    providerId: devModel.providerId,
    modelUuid: devModel.modelUuid,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature: 0.7,
    // Bilingual 7-reply thread ≈ besar; tanpa maxTokens eksplisit output bisa terpotong → parse fail.
    // 90% length target per post → butuh headroom lebih.
    maxTokens: 3200
  }).catch(() => null);
  // Meta LLM aktif: attempt-1 bila sukses, else retry bila sukses.
  let activeLlm: Awaited<ReturnType<typeof runLLMCompletion>> | null = llmResult;

  let parsed = llmResult ? parseThread(llmResult.output.text) : null;
  if (!parsed) {
    // 1x retry suhu lebih rendah untuk format JSON yang lebih disiplin.
    // Retry juga mencakup kasus attempt-1 throw (transport/provider fail).
    const retry = await runLLMCompletion(supabase, {
      requestId: null,
      sessionId,
      stage: 'developing',
      providerId: devModel.providerId,
      modelUuid: devModel.modelUuid,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `${user}\n\nPENTING: output sebelumnya gagal diparse. Kembalikan JSON VALID sesuai shape, tanpa teks tambahan.` }
      ],
      temperature: 0.3,
      maxTokens: 3200
    }).catch(() => null);
    parsed = retry ? parseThread(retry.output.text) : null;
    if (!parsed) {
      await supabase.from('content_research_logs').insert({
        session_id: sessionId,
        stage: 'developing',
        level: 'error',
        message: `development LLM raw topic ${topicId} (first 2000 chars, attempt 2): ${(retry?.output.text ?? llmResult?.output.text ?? '(no output)').slice(0, 2000)}`
      });
      throw new Error('thread parse failed');
    }
    activeLlm = retry;
    await supabase.from('content_research_logs').insert({
      session_id: sessionId,
      stage: 'developing',
      level: 'info',
      message: `topic ${topicId} parsed on retry`
    });
  }
  if (!activeLlm) throw new Error('thread parse failed');

  // parsed & activeLlm dijamin non-null di sini (throw di atas jika gagal dua kali).
  const parsedThread = parsed!;
  const resolvedLlm = activeLlm!;
  let resolvedPostIndex = 0;
  let working = parsedThread;
  if (affiliate) {
    const repositioned = repositionPlaceholder(parsedThread, 'middle');
    working = repositioned.thread;
    resolvedPostIndex = repositioned.postIndex;
  }

  // Replace placeholders only when an affiliate was selected.
  const replaced = affiliate
    ? replacePlaceholders(working, affiliate.product.url)
    : working;

  // Look up provider_id from slug (for the foreign key).
  const { data: providerRow } = await supabase
    .from('llm_providers')
    .select('id')
    .eq('slug', resolvedLlm.providerSlug)
    .maybeSingle();
  const providerId = (providerRow as { id: string } | null)?.id ?? null;

  const injection = affiliate
    ? [
        {
          friendly_code: affiliate.product.friendly_code,
          url: affiliate.product.url,
          post_index: resolvedPostIndex,
          match_score: affiliate.matchScore,
          match_signals: affiliate.signals,
          product_name_id: affiliate.product.name_id,
          product_name_en: affiliate.product.name_en,
          product_image: affiliate.product.image,
          product_category: affiliate.product.category,
          product_merchant: affiliate.product.merchant
        }
      ]
    : [];

  const { error: draftError } = await supabase.from('content_drafts').insert({
    request_id: sessionId,
    provider_id: providerId,
    model_id: resolvedLlm.model,
    research_topic_id: topicId,
    generated_thread: replaced as unknown as Record<string, unknown>,
    affiliate_injections: injection as unknown as Record<string, unknown>[],
    status: 'needs_review',
    llm_meta: {
      provider: resolvedLlm.providerSlug,
      model: resolvedLlm.model,
      latency_ms: resolvedLlm.latencyMs,
      key_hash: resolvedLlm.keyHash
    },
    affiliate_match_score: affiliate?.matchScore ?? null,
    affiliate_match_signals: affiliate
      ? (affiliate.signals as unknown as Record<string, unknown>)
      : null
  });
  if (draftError) {
    await supabase.from('content_research_logs').insert({
      session_id: sessionId,
      stage: 'developing',
      level: 'error',
      message: `draft insert failed: ${draftError.message}`
    });
    throw new Error(`draft insert failed: ${draftError.message}`);
  }

  await supabase.from('content_research_logs').insert({
    session_id: sessionId,
    stage: 'developing',
    level: 'info',
    message: affiliate
      ? `draft generated with affiliate ${affiliate.product.friendly_code} (match ${affiliate.matchScore}${affiliate.signals.fallback_random ? ' fallback random' : ''})`
      : 'draft generated without affiliate (empty pool)'
  });
}
