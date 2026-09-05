import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildThreadPrompt } from '@/lib/llm/prompt';
import { runLLMCompletion } from '@/lib/llm/completion';
import { selectAffiliateWithRandomFallback, type SelectedAffiliate } from './affiliate';
import { MAX_THREAD_REPLIES_DB, DEVELOP_PAIRS_PER_TICK, auditThreadLength, auditThreadEmoji, type LengthIssue, parseThread, replacePlaceholders, repositionPlaceholder } from './thread';

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
export { DEVELOP_PAIRS_PER_TICK };
export type { LengthIssue };

export interface TargetPlatform {
  slug: string;
  maxChars: number | null;
}

/** Kunci idempotensi pasangan draf: topik × platform × produk (null = mekanisme satu). */
export function pairKey(topicId: string | null, platformSlug: string | null, productId: string | null): string {
  return `${topicId}|${platformSlug ?? 'all'}|${productId ?? '-'}`;
}

/**
 * Resolver tunggal daftar platform target sesi (sumber kebenaran ganda legacy):
 * platform_slugs (multi baru) > platform_slug (tunggal) > ekspansi semua aktif.
 * 'all'/null lama = ekspansi semua platform aktif.
 */
export async function resolveTargetPlatforms(
  supabase: SupabaseClient,
  sess: { platform_slug: string | null; platform_slugs?: string[] | null }
): Promise<TargetPlatform[]> {
  const multi = (sess.platform_slugs ?? []).filter(Boolean);
  if (multi.length > 0) {
    const { data } = await supabase
      .from('platforms')
      .select('slug, max_chars')
      .in('slug', multi)
      .eq('is_active', true);
    const rows = (data ?? []) as { slug: string; max_chars: number | null }[];
    const bySlug = new Map(rows.map((r) => [r.slug, r]));
    return multi
      .filter((s) => bySlug.has(s))
      .map((s) => ({ slug: s, maxChars: bySlug.get(s)!.max_chars }));
  }
  if (sess.platform_slug) {
    const { data: platformRow } = await supabase
      .from('platforms')
      .select('slug, max_chars')
      .eq('slug', sess.platform_slug)
      .maybeSingle();
    const row = platformRow as { slug: string; max_chars: number | null } | null;
    if (row) return [{ slug: row.slug, maxChars: row.max_chars }];
  }
  const { data } = await supabase
    .from('platforms')
    .select('slug, max_chars')
    .eq('is_active', true)
    .neq('slug', 'all')
    .order('slug', { ascending: true });
  return ((data ?? []) as { slug: string; max_chars: number | null }[]).map((r) => ({
    slug: r.slug,
    maxChars: r.max_chars
  }));
}

export async function runDevelopment(
  supabase: SupabaseClient,
  sessionId: string,
  pinnedModelId?: string | null
): Promise<number> {
  const { data: session, error: sessionError } = await supabase
    .from('content_research_sessions')
    .select('id, mechanism, platform_slug, platform_slugs, tone, account_goal, audience_age, audience_interests, target_location, target_reply_count')
    .eq('id', sessionId)
    .single();
  if (sessionError || !session) throw new Error('session not found');
  const sess = session as {
    id: string;
    mechanism: string | null;
    platform_slug: string | null;
    platform_slugs: string[] | null;
    tone: string | null;
    account_goal: string | null;
    audience_age: string | null;
    target_reply_count: number | null;
  };
  const isDua = sess.mechanism === 'dua';

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
    return 0;
  }
  const allTopics = topics as ShortlistedTopic[];

  const targets = await resolveTargetPlatforms(supabase, sess);
  if (targets.length === 0) throw new Error('no active target platforms');

  // Idempotency per pasangan agar cron re-pick dan inline retry tidak
  // memproduksi duplikat. Mekanisme satu: (topik × platform); dua: + produk.
  const topicIds = allTopics.map((t) => t.id);
  const { data: existingDrafts } = await supabase
    .from('content_drafts')
    .select('research_topic_id, platform_slug, product_id')
    .in('research_topic_id', topicIds);
  type ExistingRow = { research_topic_id: string | null; platform_slug: string | null; product_id: string | null };
  const donePairs = new Set(
    ((existingDrafts ?? []) as ExistingRow[])
      .map((d) => pairKey(d.research_topic_id, d.platform_slug, isDua ? d.product_id : null))
      .filter((v) => !v.startsWith('null|'))
  );

  // Mekanisme dua: produk tetap pilihan user (tanpa seleksi acak).
  let fixedProducts: Array<{ id: string; friendly_code: string; external_id: string; name_id: string; name_en: string; category: string; merchant: string; url: string; image: string }> = [];
  if (isDua) {
    const { fetchFixedProducts } = await import('./orchestrator');
    fixedProducts = await fetchFixedProducts(supabase, sessionId);
    // Hanya yang masih aktif.
    const { data: activeRows } = await supabase
      .from('affiliate_products')
      .select('id')
      .in('id', fixedProducts.map((p) => p.id))
      .eq('is_active', true);
    const activeIds = new Set(((activeRows ?? []) as { id: string }[]).map((r) => r.id));
    fixedProducts = fixedProducts.filter((p) => activeIds.has(p.id));
    if (fixedProducts.length === 0) {
      await supabase
        .from('content_research_sessions')
        .update({ status: 'failed', error_message: 'developing: produk tetap tidak aktif/hilang' })
        .eq('id', sessionId);
      return 0;
    }
  }

  const pendingPairs: { topic: ShortlistedTopic; platform: TargetPlatform; productId: string | null }[] = [];
  for (const topic of allTopics) {
    for (const platform of targets) {
      if (isDua) {
        for (const fp of fixedProducts) {
          if (!donePairs.has(pairKey(topic.id, platform.slug, fp.id))) {
            pendingPairs.push({ topic, platform, productId: fp.id });
          }
        }
      } else if (!donePairs.has(pairKey(topic.id, platform.slug, null))) {
        pendingPairs.push({ topic, platform, productId: null });
      }
    }
  }

  if (pendingPairs.length === 0) {
    await supabase.from('content_research_logs').insert({
      session_id: sessionId,
      stage: 'developing',
      level: 'info',
      message: `all ${allTopics.length} shortlisted topics already have drafts for ${targets.length} platform(s); nothing to do`
    });
    return 0;
  }

  // Chunking: kerjakan maksimal N pasangan per tick agar tidak timeout.
  const batch = pendingPairs.slice(0, DEVELOP_PAIRS_PER_TICK);
  const affiliateCache = new Map<string, SelectedAffiliate | null>();
  const fixedById = new Map(fixedProducts.map((p) => [p.id, p]));

  for (const { topic, platform, productId } of batch) {
    // Mekanisme satu: affiliate dipilih 1× per topik lalu dipakai ulang
    // lintas platform. Mekanisme dua: produk tetap pilihan user.
    let affiliate: SelectedAffiliate | null;
    if (isDua) {
      const fp = productId ? fixedById.get(productId) : undefined;
      if (!fp) {
        await supabase.from('content_research_logs').insert({
          session_id: sessionId,
          stage: 'developing',
          level: 'warn',
          message: `topic "${topic.topic.slice(0, 80)}" (${topic.id}) × ${platform.slug} skipped: produk tetap hilang — lanjut ke pasangan berikut`
        });
        continue;
      }
      affiliate = {
        product: fp,
        matchScore: 0,
        signals: { category_match: false, keyword_overlap: 0, scored_from_pool_size: 0, fixed_pick: true }
      };
    } else {
      if (!affiliateCache.has(topic.id)) {
        affiliateCache.set(
          topic.id,
          await selectAffiliateWithRandomFallback(supabase, {
            topic: topic.topic,
            category: topic.category,
            unique_angle: topic.unique_angle,
            key_facts: Array.isArray(topic.key_facts) ? (topic.key_facts as string[]) : undefined,
            hooks: Array.isArray(topic.hooks)
              ? (topic.hooks as Array<{ type: string; text: string }>)
              : undefined
          })
        );
      }
      affiliate = affiliateCache.get(topic.id) ?? null;
    }

    // Per-pasangan guard: 1 pasangan gagal tidak boleh menggagalkan sisanya.
    try {
      await generateAndInsertDraft(supabase, sessionId, topic.id, platform, sess, topic, affiliate, pinnedModelId, isDua ? productId : null);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await supabase.from('content_research_logs').insert({
        session_id: sessionId,
        stage: 'developing',
        level: 'warn',
        message: `topic "${topic.topic.slice(0, 80)}" (${topic.id}) × ${platform.slug}${productId ? ` × ${productId.slice(0, 8)}` : ''} skipped: ${message} — lanjut ke pasangan berikut`
      });
    }
  }

  // Jika SEMUA pasangan batch gagal, tandai failed agar admin tahu.
  const batchKeys = batch.map(({ topic, platform, productId }) =>
    pairKey(topic.id, platform.slug, isDua ? productId : null)
  );
  const { data: afterDrafts } = await supabase
    .from('content_drafts')
    .select('research_topic_id, platform_slug, product_id')
    .in('research_topic_id', topicIds);
  const afterDone = new Set(
    ((afterDrafts ?? []) as { research_topic_id: string | null; platform_slug: string | null; product_id: string | null }[])
      .map((d) => pairKey(d.research_topic_id, d.platform_slug, isDua ? d.product_id : null))
  );
  const newDraftCount = batchKeys.filter((k) => afterDone.has(k)).length;
  if (newDraftCount <= 0) {
    await supabase
      .from('content_research_sessions')
      .update({ status: 'failed', error_message: `developing: ${batch.length} pasangan gagal (lihat log warn per-pasangan)` })
      .eq('id', sessionId);
    return 0;
  }
  const remaining = pendingPairs.length - newDraftCount;
  if (remaining > 0) {
    await supabase.from('content_research_logs').insert({
      session_id: sessionId,
      stage: 'developing',
      level: 'info',
      message: `developing progress: ${pendingPairs.length - remaining}/${pendingPairs.length} pasangan selesai (${remaining} tersisa, lanjut tick berikut)`
    });
  }
  return remaining;
}

async function generateAndInsertDraft(
  supabase: SupabaseClient,
  sessionId: string,
  topicId: string,
  platform: { slug: string; maxChars: number | null },
  sess: { tone: string | null; account_goal: string | null; audience_age: string | null; target_reply_count: number | null },
  topic: ShortlistedTopic,
  affiliate: SelectedAffiliate | null,
  pinnedModelId?: string | null,
  fixedProductId?: string | null
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
  // Guard selaras CHECK DB thread_shape (MAX_THREAD_REPLIES_DB): jangan kirim
  // insert yang pasti 23514 (kasus 4e03bde2/f7c91699). Fail cepat dengan pesan jelas.
  if (parsedThread.replies.length > MAX_THREAD_REPLIES_DB) {
    await supabase.from('content_research_logs').insert({
      session_id: sessionId,
      stage: 'developing',
      level: 'error',
      message: `thread replies ${parsedThread.replies.length} melebihi batas DB ${MAX_THREAD_REPLIES_DB} (topic ${topicId})`
    });
    throw new Error(`thread replies ${parsedThread.replies.length} melebihi batas DB ${MAX_THREAD_REPLIES_DB}`);
  }
  let resolvedPostIndex = 0;
  let working = parsedThread;
  if (affiliate) {
    const repositioned = repositionPlaceholder(parsedThread, 'middle');
    working = repositioned.thread;
    resolvedPostIndex = repositioned.postIndex;
  }

  // Replace placeholders only when an affiliate was selected.
  let finalThread = affiliate
    ? replacePlaceholders(working, affiliate.product.url)
    : working;

  // Audit emoji: tiap post (id + en) wajib 1-2 emoji relevan. Kosong → 1x repair;
  // masih kosong → simpan + tandai (konsisten kebijakan over-limit).
  let emojiGaps = auditThreadEmoji(finalThread);
  if (emojiGaps.length > 0) {
    const gapDesc = emojiGaps
      .slice(0, 8)
      .map((g) => `post-${g.post} ${g.lang}`)
      .join(', ');
    const retryEmoji = await runLLMCompletion(supabase, {
      requestId: null,
      sessionId,
      stage: 'developing',
      providerId: devModel.providerId,
      modelUuid: devModel.modelUuid,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `${user}\n\nPENTING: post berikut TIDAK mengandung emoji: ${gapDesc}. Tulis ulang thread yang SAMA dengan tambahan 1-2 emoji relevan per post tersebut (jangan ganti kata dengan emoji, patuhi HARD LIMIT char), tanpa mengubah fakta/CTA/URL/struktur JSON.` }
      ],
      temperature: 0.3,
      maxTokens: 3200
    }).catch(() => null);
    const parsedEmoji = retryEmoji ? parseThread(retryEmoji.output.text) : null;
    if (parsedEmoji) {
      let we = parsedEmoji;
      if (affiliate) {
        const repositioned = repositionPlaceholder(parsedEmoji, 'middle');
        we = repositioned.thread;
        resolvedPostIndex = repositioned.postIndex;
      }
      finalThread = affiliate ? replacePlaceholders(we, affiliate.product.url) : we;
      activeLlm = retryEmoji;
      emojiGaps = auditThreadEmoji(finalThread);
    }
  }
  const emojiMissing = emojiGaps.length > 0;
  if (emojiMissing) {
    await supabase.from('content_research_logs').insert({
      session_id: sessionId,
      stage: 'developing',
      level: 'warn',
      message: `topic ${topicId} × ${platform.slug}: ${emojiGaps.length} post tanpa emoji (${emojiGaps.slice(0, 6).map((g) => `post-${g.post} ${g.lang}`).join(', ')}) — draf disimpan dengan tanda`
    });
  }

  // Validasi panjang terhadap batas platform (teks final, URL asli).
  // Over → 1x retry-shorten; masih over → simpan + tandai (jangan gagal sunyi).
  let lengthIssues = auditThreadLength(finalThread, platform.maxChars);
  if (lengthIssues.length > 0) {
    const overDesc = lengthIssues
      .slice(0, 6)
      .map((o) => `post-${o.post} ${o.lang} (${o.chars}/${o.max})`)
      .join(', ');
    const retryShort = await runLLMCompletion(supabase, {
      requestId: null,
      sessionId,
      stage: 'developing',
      providerId: devModel.providerId,
      modelUuid: devModel.modelUuid,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `${user}\n\nPENTING: post berikut MELEBIHI batas maksimum platform: ${overDesc}. Tulis ulang thread yang SAMA tetapi pendekkan post tersebut hingga ≤ batas (HARD LIMIT), tanpa mengubah fakta/CTA/URL/struktur JSON.` }
      ],
      temperature: 0.3,
      maxTokens: 3200
    }).catch(() => null);
    const parsedShort = retryShort ? parseThread(retryShort.output.text) : null;
    if (parsedShort) {
      let ws = parsedShort;
      if (affiliate) {
        const repositioned = repositionPlaceholder(parsedShort, 'middle');
        ws = repositioned.thread;
        resolvedPostIndex = repositioned.postIndex;
      }
      finalThread = affiliate ? replacePlaceholders(ws, affiliate.product.url) : ws;
      activeLlm = retryShort;
      lengthIssues = auditThreadLength(finalThread, platform.maxChars);
    }
  }
  const overLimit = lengthIssues.length > 0;
  if (overLimit) {
    await supabase.from('content_research_logs').insert({
      session_id: sessionId,
      stage: 'developing',
      level: 'warn',
      message: `topic ${topicId} × ${platform.slug}: ${lengthIssues.length} post melebihi ${platform.maxChars} char (${lengthIssues.slice(0, 4).map((o) => `post-${o.post} ${o.lang} ${o.chars}`).join(', ')}) — draf disimpan dengan tanda, edit sebelum posting`
    });
  }

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
          match_score: fixedProductId ? null : affiliate.matchScore,
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
    platform_slug: platform.slug,
    product_id: fixedProductId ?? null,
    generated_thread: finalThread as unknown as Record<string, unknown>,
    affiliate_injections: injection as unknown as Record<string, unknown>[],
    status: 'needs_review',
    llm_meta: {
      provider: resolvedLlm.providerSlug,
      model: resolvedLlm.model,
      latency_ms: resolvedLlm.latencyMs,
      key_hash: resolvedLlm.keyHash,
      platform: platform.slug,
      max_chars: platform.maxChars,
      over_limit: overLimit,
      length_audit: lengthIssues,
      emoji_missing: emojiMissing,
      emoji_gaps: emojiGaps
    },
    affiliate_match_score: fixedProductId ? null : (affiliate?.matchScore ?? null),
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
      ? `draft generated [${platform.slug}]${fixedProductId ? ' [fixed]' : ''} with affiliate ${affiliate.product.friendly_code} (match ${fixedProductId ? 'fixed' : affiliate.matchScore}${affiliate.signals.fallback_random ? ' fallback random' : ''})${overLimit ? ' OVER-LIMIT' : ''}${emojiMissing ? ' EMOJI-MISSING' : ''}`
      : `draft generated [${platform.slug}] without affiliate (empty pool)`
  });
}
