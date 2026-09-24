import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildThreadPrompt } from '@/lib/llm/prompt';
import {
  ARTICLE_MIN_WORDS,
  auditArticleEmoji,
  buildArticleExpandPrompt,
  buildArticlePrompt,
  countArticleWords,
  isValidCoverPrompt,
  parseArticleDraft,
  debugArticleRejectReason,
  repairArticleJson,
  type ParsedArticleDraft
} from '@/lib/llm/prompt';
import { runLLMCompletion } from '@/lib/llm/completion';
import { ProviderRegistry } from '@/lib/llm/registry';
import { fetchOrderedModels } from '@/lib/supabase/vault';
import { selectAffiliateWithRandomFallback, type SelectedAffiliate } from './affiliate';
import { MAX_THREAD_REPLIES_DB, DEVELOP_PAIRS_PER_TICK, auditThreadLength, auditThreadEmoji, type LengthIssue, parseThread, replacePlaceholders, repositionPlaceholder, shouldAcceptRepairThread } from './thread';

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

/** Batas deferral produk-tetap (transient) per sesi dalam window 24 jam — melebihi → failed. */
export const FIXED_PRODUCT_DEFER_LIMIT = 5;
const FIXED_PRODUCT_DEFER_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Hasil klasifikasi kandidat produk-tetap mekanisme dua. */
export interface FixedProductClassification {
  /** Produk yang lolos dan siap dipakai developing. */
  active: FixedProduct[];
  /** Produk terdaftar tapi is_active=false — kondisi permanen, bukan transient. */
  inactive: FixedProduct[];
  /** Sesi mendaftarkan produk tapi semua baris join hilang/nonaktif. */
  noneConfigured: boolean;
}

interface FixedProduct {
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

/**
 * Klasifikasi murni kandidat produk-tetap: bedakan "sesi tanpa produk
 * terdaftar" (konfigurasi rusak — gagal permanen), "produk nonaktif"
 * (permanen), dan "join kosong" (transient — layak defer ke tick berikut).
 */
export function classifyFixedProducts(
  registeredCount: number,
  fetched: Array<{ id: string }>,
  activeIds: Set<string>
): FixedProductClassification {
  if (registeredCount === 0 || fetched.length === 0) {
    return { active: [], inactive: [], noneConfigured: true };
  }
  const active: FixedProduct[] = [];
  const inactive: FixedProduct[] = [];
  for (const p of fetched) {
    if (activeIds.has(p.id)) active.push(p as FixedProduct);
    else inactive.push(p as FixedProduct);
  }
  return { active, inactive, noneConfigured: false };
}

/**
 * Hitung deferral produk-tetap sebelumnya (log warn transient) dalam window 24 jam.
 * Murni: supabase disuntik sebagai counter async agar testable.
 */
export async function countFixedProductDeferrals(
  sessionId: string,
  countFn: (sessionId: string) => Promise<number>
): Promise<number> {
  return countFn(sessionId);
}

/** Bahasa artikel yang wajib terisi dari nilai kolom session.language. */
export function requiredArticleLangs(language: string | null): Array<'id' | 'en'> {
  if (language === 'en') return ['en'];
  if (language === 'id') return ['id'];
  return ['id', 'en'];
}

/** Thread minimal yang valid (CHECK thread_shape) untuk draf artikel. */
export function buildArticleMinimalThread(parsed: ParsedArticleDraft): { main: { id: string; en: string }; replies: never[] } {
  return {
    main: {
      id: parsed.id?.title ?? parsed.en?.title ?? '(artikel)',
      en: parsed.en?.title ?? parsed.id?.title ?? '(article)'
    },
    replies: []
  };
}

/** Kunci idempotensi pasangan draf: topik × platform × produk (null = mekanisme satu). */
export function pairKey(topicId: string | null, platformSlug: string | null, productId: string | null): string {
  return `${topicId}|${platformSlug ?? 'all'}|${productId ?? '-'}`;
}

/** Pasangan pending eksak (produk-tetap belum terbaca): hitung per ID terdaftar. */
export function estimatePendingPairsExact(
  topics: Array<{ id: string }>,
  targets: TargetPlatform[],
  donePairs: Set<string>,
  productIds: string[]
): number {
  let count = 0;
  for (const topic of topics) {
    for (const platform of targets) {
      for (const productId of productIds) {
        if (!donePairs.has(pairKey(topic.id, platform.slug, productId))) count++;
      }
    }
  }
  return count;
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
    .select('id, mechanism, platform_slug, platform_slugs, tone, account_goal, audience_age, audience_interests, target_location, target_reply_count, template_slug, language')
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
    template_slug: string | null;
    language: string | null;
  };
  const isDua = sess.mechanism === 'dua';

  // Template riset pilihan user (opsional): struktur thread mengikuti hint-nya.
  const { getResearchTemplateHint } = await import('./templates');
  const templateRow = await getResearchTemplateHint(supabase, sess.template_slug ?? null);
  const templateStructure = templateRow?.development_hint ?? null;

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
      .update({ status: 'failed', error_message: 'no shortlisted topics', updated_at: new Date().toISOString() })
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
  // Klasifikasi 3 kasus (join kosong/transient vs nonaktif/permanen vs
  // tanpa konfigurasi) — jangan samakan lagi (RCA 9a24c768).
  let fixedProducts: FixedProduct[] = [];
  if (isDua) {
    const { fetchFixedProducts } = await import('./orchestrator');
    const { data: registeredRows } = await supabase
      .from('content_research_session_products')
      .select('product_id')
      .eq('session_id', sessionId);
    const registeredIds = ((registeredRows ?? []) as { product_id: string }[]).map((r) => r.product_id);
    const fetchedRaw = await fetchFixedProducts(supabase, sessionId);
    const { data: activeRows } = await supabase
      .from('affiliate_products')
      .select('id')
      .in(
        'id',
        fetchedRaw.map((p) => p.id)
      )
      .eq('is_active', true);
    const activeIds = new Set(((activeRows ?? []) as { id: string }[]).map((r) => r.id));
    const classification = classifyFixedProducts(registeredIds.length, fetchedRaw, activeIds);
    fixedProducts = classification.active;

    if (classification.noneConfigured) {
      // Sesi mendaftarkan 0 produk ATAU join kosong: sebelumnya transient
      // (RCA 9a24c768). Defer + cap 5/24j — hanya gagal permanen saat cap habis.
      // Pending dihitung eksak dari ID terdaftar: bila 0 (semua draf sudah
      // ada), jangan defer — biarkan sesi selesai.
      const pendingExact = estimatePendingPairsExact(allTopics, targets, donePairs, registeredIds);
      if (pendingExact === 0) {
        await supabase.from('content_research_logs').insert({
          session_id: sessionId,
          stage: 'developing',
          level: 'info',
          message: `all ${allTopics.length} shortlisted topics already have drafts for ${targets.length} platform(s) × ${registeredIds.length} product(s); nothing to do`
        });
        return 0;
      }
      const deferredCount = await countFixedProductDeferrals(sessionId, async (id) => {
        const { count } = await supabase
          .from('content_research_logs')
          .select('id', { count: 'exact', head: true })
          .eq('session_id', id)
          .eq('stage', 'developing')
          .eq('level', 'warn')
          .ilike('message', '%fixed products read empty%')
          .gte('created_at', new Date(Date.now() - FIXED_PRODUCT_DEFER_WINDOW_MS).toISOString());
        return count ?? 0;
      });
      if (deferredCount >= FIXED_PRODUCT_DEFER_LIMIT) {
        await supabase
          .from('content_research_sessions')
          .update({
            status: 'failed',
            error_message: 'developing: produk tetap tidak terbaca setelah 5x deferral 24 jam — cek content_research_session_products',
            updated_at: new Date().toISOString()
          })
          .eq('id', sessionId);
        return 0;
      }
      await supabase.from('content_research_logs').insert({
        session_id: sessionId,
        stage: 'developing',
        level: 'warn',
        message: `fixed products read empty (registered=${registeredIds.length}, fetched=${fetchedRaw.length}) — ${pendingExact} pasangan ditunda ke tick berikut (deferral ${deferredCount + 1}/${FIXED_PRODUCT_DEFER_LIMIT})`
      });
      return pendingExact;
    }

    if (classification.inactive.length > 0) {
      const inactiveDesc = classification.inactive
        .map((p) => `${p.friendly_code}/${p.id.slice(0, 8)}`)
        .join(', ');
      await supabase.from('content_research_logs').insert({
        session_id: sessionId,
        stage: 'developing',
        level: 'warn',
        message: `fixed products inactive: ${inactiveDesc} — lanjut dengan ${fixedProducts.length} aktif`
      });
    }
    if (fixedProducts.length === 0) {
      // Semua terdaftar tapi is_active=false — kondisi permanen (bukan transient).
      await supabase
        .from('content_research_sessions')
        .update({
          status: 'failed',
          error_message: `developing: semua produk tetap nonaktif (${classification.inactive.map((p) => p.friendly_code).join(', ')}) — aktifkan kembali atau pilih produk lain`,
          updated_at: new Date().toISOString()
        })
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
      if (platform.slug === 'artikel') {
        await generateArticleAndInsertDraft(supabase, sessionId, topic.id, sess, topic, affiliate, pinnedModelId, isDua ? productId : null, templateStructure);
      } else {
        await generateAndInsertDraft(supabase, sessionId, topic.id, platform, sess, topic, affiliate, pinnedModelId, isDua ? productId : null, templateStructure);
      }
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
      .update({
        status: 'failed',
        error_message: `developing: ${batch.length} pasangan gagal (lihat log warn per-pasangan)`,
        updated_at: new Date().toISOString()
      })
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

/** Resolve model developing: pinnedModelId > stage default > global. */
async function resolveDevelopingModel(
  supabase: SupabaseClient,
  pinnedModelId?: string | null
): Promise<{ providerId: string | null; modelUuid: string | null }> {
  if (pinnedModelId) {
    const { data: m } = await supabase.from('llm_models').select('id, provider_id, is_active').eq('id', pinnedModelId).eq('is_active', true).maybeSingle();
    const mr = m as { id: string; provider_id: string; is_active: boolean } | null;
    if (mr) return { providerId: mr.provider_id, modelUuid: mr.id };
  }
  try {
    const { resolveStageModel } = await import('@/lib/llm/stage-defaults');
    return await resolveStageModel('developing', null);
  } catch { return { providerId: null, modelUuid: null }; }
}

/** Provider slug LLM → id FK (untuk kolom provider_id). */
async function lookupProviderId(supabase: SupabaseClient, providerSlug: string): Promise<string | null> {
  const { data: providerRow } = await supabase
    .from('llm_providers')
    .select('id')
    .eq('slug', providerSlug)
    .maybeSingle();
  return (providerRow as { id: string } | null)?.id ?? null;
}

// Eventual cover: enqueue 1 pending post_index=0 agar worker cron
// memproses otomatis tanpa tunggu lazy scan. Idempoten via count guard.
async function enqueueCoverImage(
  supabase: SupabaseClient,
  sessionId: string,
  draftId: string,
  coverPrompt?: string
): Promise<void> {
  try {
    const { count } = await supabase
      .from('content_draft_images')
      .select('id', { count: 'exact', head: true })
      .eq('draft_id', draftId)
      .eq('post_index', 0);
    if ((count ?? 0) !== 0) return; // sudah ada baris cover (idempoten).

    // VALIDASI ringkas via helper yang sama agar satu sumber kebenaran dengan parse di LLM stage.
    // Bila valid → pre-isi prompt + status 'prompt_ready' = menunggu review.
    // Bila tidak → fallback kosong agar reasoning LLM worker menangani cover (jalan lama).
    const imagePrompt = isValidCoverPrompt(coverPrompt) ? coverPrompt.trim() : '';

    if (imagePrompt) {
      // Pre-isi prompt + status 'prompt_ready' = menunggu review (bukan 'pending' agar worker tidak langsung render).
      // Column `reasoning` & `llm_meta` adalah JSON (existing shape), jadi bisa langsung diisi object.
      await supabase.from('content_draft_images').insert({
        draft_id: draftId,
        post_index: 0,
        image_prompt: imagePrompt,
        status: 'prompt_ready',
        reasoning: { visual_strategy: 'developing', justification: 'cover prompt dari LLM developing (konteks artikel penuh)' },
        llm_meta: { stage: 'developing', from_developing: true },
        provider_slug: '',
        model_id: ''
      });
    } else {
      // Fallback ke jalur lama: reasoning LLM di worker nanti mengisi prompt dari judul + topik.
      await supabase.from('content_draft_images').insert({
        draft_id: draftId,
        post_index: 0,
        image_prompt: '',
        provider_slug: '',
        model_id: ''
      });
    }
  } catch (e) {
    await supabase.from('content_research_logs').insert({
      session_id: sessionId,
      stage: 'image_enqueue',
      level: 'warn',
      message: `image enqueue cover failed for draft ${draftId}: ${e instanceof Error ? e.message : String(e)}`
    });
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
  pinnedModelId?: string | null,
  fixedProductId?: string | null,
  templateStructure?: string | null
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
      isFallbackRandom,
      templateStructure: templateStructure ?? null
    },
    promptProduct
  );

  // Resolve developing model: pinnedModelId > stage default > global
  const devModel = await resolveDevelopingModel(supabase, pinnedModelId);

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
    // Format "Balasan N (bahasa ID/EN)" — jangan "post-N id" agar model tidak
    // salah baca sebagai instruksi isi (insiden 2026-09-24: repair mengembalikan
    // label "main"/"reply-N" sebagai konten). "Balasan 0" = main post, terima apa adanya.
    const gapDesc = emojiGaps
      .slice(0, 8)
      .map((g) => `Balasan ${g.post} (bahasa ${g.lang === 'id' ? 'ID' : 'EN'})`)
      .join(', ');
    const retryEmoji = await runLLMCompletion(supabase, {
      requestId: null,
      sessionId,
      stage: 'developing',
      providerId: devModel.providerId,
      modelUuid: devModel.modelUuid,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `${user}\n\nPENTING: post berikut TIDAK mengandung emoji: ${gapDesc}. DILARANG mengembalikan label seperti "main", "reply-1", atau angka saja sebagai isi post — setiap field id dan en WAJIB kalimat lengkap (>20 karakter). Kembalikan SEMUA post (bukan hanya yang gap), dengan struktur JSON dan jumlah reply yang SAMA persis. Tulis ulang thread yang SAMA dengan tambahan 1-2 emoji relevan per post tersebut (jangan ganti kata dengan emoji, patuhi HARD LIMIT char), tanpa mengubah fakta/CTA/URL/struktur JSON.` }
      ],
      temperature: 0.3,
      maxTokens: 3200
    }).catch(() => null);
    const parsedEmoji = retryEmoji ? parseThread(retryEmoji.output.text) : null;
    if (parsedEmoji) {
      // Quality guard 2026-09-24: terima repair hanya bila konten utuh dan
      // gap tidak bertambah (kasus 0bcf2f6e: skeleton "main"/"reply-N" menimpa thread bagus).
      let candidate = parsedEmoji;
      let candidatePostIndex = resolvedPostIndex;
      if (affiliate) {
        const repositioned = repositionPlaceholder(parsedEmoji, 'middle');
        candidate = repositioned.thread;
        candidatePostIndex = repositioned.postIndex;
      }
      const candidateFinal = affiliate ? replacePlaceholders(candidate, affiliate.product.url) : candidate;
      const candidateGaps = auditThreadEmoji(candidateFinal);
      if (shouldAcceptRepairThread(finalThread, candidateFinal) && candidateGaps.length <= emojiGaps.length) {
        finalThread = candidateFinal;
        resolvedPostIndex = candidatePostIndex;
        activeLlm = retryEmoji;
        emojiGaps = candidateGaps;
      } else {
        await supabase.from('content_research_logs').insert({
          session_id: sessionId,
          stage: 'developing',
          level: 'warn',
          message: `topic ${topicId} × ${platform.slug}: emoji repair ditolak (quality guard, gaps ${emojiGaps.length}→${candidateGaps.length}) — pakai thread awal`
        });
      }
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
        { role: 'user', content: `${user}\n\nPENTING: post berikut MELEBIHI batas maksimum platform: ${overDesc}. DILARANG mengembalikan label seperti "main"/"reply-N" sebagai isi; setiap field WAJIB kalimat lengkap. Pertahankan jumlah reply dan struktur JSON yang sama persis. Tulis ulang thread yang SAMA tetapi pendekkan post tersebut hingga ≤ batas. Aturan override untuk retry ini: HARD LIMIT MENANG atas target panjang — potong kalimat/napas per post (boleh 2 kalimat pendek), JANGAN korbankan fakta/CTA/nama produk/URL/emoji/struktur JSON. Tetap: 1 placeholder di reply yang sama dengan NAMA PRODUK.` }
      ],
      temperature: 0.3,
      maxTokens: 3200
    }).catch(() => null);
    const parsedShort = retryShort ? parseThread(retryShort.output.text) : null;
    if (parsedShort) {
      // Quality guard 2026-09-24 (cermin repair emoji): tolak kandidat
      // skeleton agar tidak menimpa thread bagus.
      let shortCandidate = parsedShort;
      let shortPostIndex = resolvedPostIndex;
      if (affiliate) {
        const repositioned = repositionPlaceholder(parsedShort, 'middle');
        shortCandidate = repositioned.thread;
        shortPostIndex = repositioned.postIndex;
      }
      const shortFinal = affiliate ? replacePlaceholders(shortCandidate, affiliate.product.url) : shortCandidate;
      const candidateIssues = auditThreadLength(shortFinal, platform.maxChars);
      if (shouldAcceptRepairThread(finalThread, shortFinal) && candidateIssues.length <= lengthIssues.length) {
        finalThread = shortFinal;
        resolvedPostIndex = shortPostIndex;
        activeLlm = retryShort;
        lengthIssues = candidateIssues;
      } else {
        await supabase.from('content_research_logs').insert({
          session_id: sessionId,
          stage: 'developing',
          level: 'warn',
          message: `topic ${topicId} × ${platform.slug}: length repair ditolak (quality guard, issues ${lengthIssues.length}→${candidateIssues.length}) — pakai thread awal`
        });
      }
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
  const providerId = await lookupProviderId(supabase, resolvedLlm.providerSlug);

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

  const { data: createdDraft, error: draftError } = await supabase.from('content_drafts').insert({
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
  }).select('id').single();
  if (draftError || !createdDraft) {
    const msg = draftError?.message ?? 'draft insert returned no id';
    await supabase.from('content_research_logs').insert({
      session_id: sessionId,
      stage: 'developing',
      level: 'error',
      message: `draft insert failed: ${msg}`
    });
    throw new Error(`draft insert failed: ${msg}`);
  }
  const newDraftId = (createdDraft as { id: string }).id;

  // Eventual cover: enqueue 1 pending post_index=0 agar worker cron (*/5)
  // memproses otomatis tanpa tunggu lazy scan. Idempoten via count guard.
  await enqueueCoverImage(supabase, sessionId, newDraftId);

  await supabase.from('content_research_logs').insert({
    session_id: sessionId,
    stage: 'developing',
    level: 'info',
    message: affiliate
      ? `draft generated [${platform.slug}]${fixedProductId ? ' [fixed]' : ''} with affiliate ${affiliate.product.friendly_code} (match ${fixedProductId ? 'fixed' : affiliate.matchScore}${affiliate.signals.fallback_random ? ' fallback random' : ''})${overLimit ? ' OVER-LIMIT' : ''}${emojiMissing ? ' EMOJI-MISSING' : ''}`
      : `draft generated [${platform.slug}] without affiliate (empty pool)`
  });
}

/**
  * Generate draf ARTIKEL long-form (platform `artikel`, tujuan SEO).
  * Beda dari thread: tanpa audit panjang/emoji per-post; gate-nya jumlah
  * kata (lunak — di bawah minimum tetap disimpan + ditandai, publish
  * yang menolak) dan kelengkapan bahasa sesi.
  */
/**
 * Fallback lintas model/provider saat parse artikel gagal (null / CJK).
 * Mencoba kandidat urut dari ProviderRegistry (priority ASC) lalu
 * fetchOrderedModels tiap provider. maks MAX_CONTENT_FALLBACK attempt.
 * Tidak memblame key — hanya mencoba kandidat berikutnya.
 */
interface ContentFallbackResult {
  llmResult: Awaited<ReturnType<typeof runLLMCompletion>> | null;
  parsed: ParsedArticleDraft | null;
  fallbackChain: Array<{ provider: string; model: string }>;
}
const MAX_CONTENT_FALLBACK = 2;
export { tryNextModelOnContentReject, MAX_CONTENT_FALLBACK };
export type { ContentFallbackResult };
async function tryNextModelOnContentReject(
  supabase: SupabaseClient,
  sessionId: string,
  topicId: string,
  system: string,
  user: string,
  temperature: number,
  maxTokens: number,
  initialProviderId: string | null,
  initialModelUuid: string | null,
  required: Array<'id' | 'en'>
): Promise<ContentFallbackResult> {
  const chain: ContentFallbackResult['fallbackChain'] = [];
  const registry = new ProviderRegistry();
  const providers = await registry.listActive();
  for (const prov of providers) {
    let candidates: Array<{ id: string; model_id: string; config: Record<string, unknown> | null }> = [];
    try {
      const ordered = await fetchOrderedModels(prov.id);
      candidates = ordered.map((m) => ({ id: m.id, model_id: m.model_id, config: m.config as Record<string, unknown> | null }));
    } catch { /* provider tidak memiliki model aktif, lewati */ }
    for (const cand of candidates) {
      // Lewati model yang sama persis dengan initial attempt
      if (cand.id === initialModelUuid) continue;
      const result = await runLLMCompletion(supabase, {
        requestId: null,
        sessionId,
        stage: 'developing',
        modelUuid: cand.id,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        temperature,
        maxTokens
      }).catch(() => null);
      if (!result) {
        continue;
      }
      const p = parseArticleDraft(result.output.text);
      if (p && required.every((l) => p[l])) {
        chain.push({ provider: prov.slug, model: result.model });
        return { llmResult: result, parsed: p, fallbackChain: chain };
      }
      // Content reject: catat warn log, coba kandidat berikutnya
      const rawJson = repairArticleJson(result.output.text);
      const rejectReason = rawJson ? debugArticleRejectReason(rawJson).trim().slice(0, 200) : '(parse null)';
      await supabase.from('content_research_logs').insert({
        session_id: sessionId,
        stage: 'developing',
        level: 'warn',
        message: `content fallback ${chain.length + 1}/${MAX_CONTENT_FALLBACK}: ${prov.slug}/${result.model} reject (${rejectReason}) → lanjut ke kandidat berikutnya`
      }).then(() => undefined, () => undefined);
      chain.push({ provider: prov.slug, model: result.model });
      if (chain.length >= MAX_CONTENT_FALLBACK) break;
    }
    if (chain.length >= MAX_CONTENT_FALLBACK) break;
  }
  return { llmResult: null, parsed: null, fallbackChain: chain };
}
async function generateArticleAndInsertDraft(
  supabase: SupabaseClient,
  sessionId: string,
  topicId: string,
  sess: { tone: string | null; account_goal: string | null; audience_age: string | null; language: string | null },
  topic: ShortlistedTopic,
  affiliate: SelectedAffiliate | null,
  pinnedModelId?: string | null,
  fixedProductId?: string | null,
  templateStructure?: string | null
): Promise<void> {
  const tone = sess.tone ?? 'casual';
  const audience = sess.audience_age ?? 'umum';
  const purpose = sess.account_goal ?? 'membagikan informasi bermanfaat';
  const language = sess.language ?? 'both';
  const required = requiredArticleLangs(language);

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

  const { system, user } = buildArticlePrompt(
    {
      topic: topic.topic,
      tone,
      audience,
      ctaStyle: 'soft_sell',
      purpose,
      language,
      hooks: topicHooks,
      keyFacts: topicKeyFacts,
      uniqueAngle: topic.unique_angle,
      templateStructure: templateStructure ?? null
    },
    promptProduct
  );

  const devModel = await resolveDevelopingModel(supabase, pinnedModelId);

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
    // Artikel long-form 800-1500 kata × 2 bahasa butuh headroom besar.
    maxTokens: 4000
  }).catch(() => null);
  let activeLlm: Awaited<ReturnType<typeof runLLMCompletion>> | null = llmResult;

  const missingLangs = (p: ParsedArticleDraft | null): Array<'id' | 'en'> =>
    p ? required.filter((l) => !p[l]) : [...required];
  let parsed = llmResult ? parseArticleDraft(llmResult.output.text) : null;
  if (!parsed || missingLangs(parsed).length > 0) {
    // Content-aware fallback: coba model/provider lain (maks 2), bukan ulang model yang sama.
    // RCA db9d92e8: naraya agnes-2.5-flash 4x CJK → fallback ke Cloudflare yang sehat.
    const fallback = await tryNextModelOnContentReject(
      supabase, sessionId, topicId,
      system, user,
      0.7, 4000,
      devModel.providerId, devModel.modelUuid,
      required
    );
    if (fallback.llmResult) {
      parsed = fallback.parsed;
      activeLlm = fallback.llmResult;
      await supabase.from('content_research_logs').insert({
        session_id: sessionId,
        stage: 'developing',
        level: 'info',
        message: `article topic ${topicId} fallback berhasil: ${fallback.fallbackChain.map((c) => `${c.provider}/${c.model}`).join(' → ')}`
      });
    } else {
      // Semua kandidat gagal — catat reject reason dari raw output terakhir
      const rawJson = repairArticleJson(llmResult?.output.text ?? '');
      const rejectReason = rawJson ? debugArticleRejectReason(rawJson).trim().slice(0, 200) : '(tidak bisa parse raw)';
      await supabase.from('content_research_logs').insert({
        session_id: sessionId,
        stage: 'developing',
        level: 'error',
        message: `development LLM raw article topic ${topicId} (reject: ${rejectReason}): ${(llmResult?.output.text ?? '(no output)').slice(0, 2000)}`
      });
      throw new Error(
        !parsed ? 'article parse failed' : `article language missing: ${missingLangs(parsed).join(',')}`
      );
    }
  }
  if (!activeLlm) throw new Error('article parse failed');

  // Ganti placeholder dengan URL afiliasi asli (per bahasa).
  // Expand pakai bentuk ber-placeholder agar repair tidak merusak URL final.
  let workingArticle: ParsedArticleDraft = { id: parsed!.id, en: parsed!.en };
  const replaceAffiliateUrls = (src: ParsedArticleDraft): ParsedArticleDraft => {
    if (!affiliate) return { id: src.id, en: src.en };
    const out: ParsedArticleDraft = { id: src.id, en: src.en };
    for (const lang of required) {
      const a = out[lang];
      if (a) {
        out[lang] = JSON.parse(
          JSON.stringify(a).split('{{PRODUCT_URL}}').join(affiliate.product.url)
        ) as typeof a;
      }
    }
    return out;
  };

  const countWords = (src: ParsedArticleDraft): Record<string, number> => {
    const wc: Record<string, number> = {};
    for (const lang of required) {
      const a = src[lang];
      if (a) wc[lang] = countArticleWords(a);
    }
    return wc;
  };

  // Repair thin-content hingga 2x: kembangkan hingga ≥800 kata (pola repair
  // emoji thread — kasus 419a2dc8: 488 kata lolos tanpa perlawanan; kasus
  // 87b9fdc1: expand 910 kata gagal diparse karena JSON cacat).
  let wordCount = countWords(workingArticle);
  let expanded = false;
  if (Object.values(wordCount).some((w) => w < ARTICLE_MIN_WORDS)) {
    const expandPrompt = buildArticleExpandPrompt(
      { topic: topic.topic, language, wordCount },
      workingArticle,
      promptProduct
    );
    const runExpand = (attempt: number) =>
      runLLMCompletion(supabase, {
        requestId: null,
        sessionId,
        stage: 'developing',
        providerId: devModel.providerId,
        modelUuid: devModel.modelUuid,
        messages: [
          { role: 'system', content: expandPrompt.system },
          {
            role: 'user',
            content:
              attempt === 0
                ? expandPrompt.user
                : `${expandPrompt.user}\n\nPENTING: output sebelumnya gagal diparse atau bahasa ${required.join('/')} tak lengkap. Kembalikan JSON VALID sesuai shape, tanpa teks tambahan, SEMUA bahasa wajib terisi penuh.`
          }
        ],
        temperature: attempt === 0 ? 0.7 : 0.3,
        maxTokens: 6000
      }).catch(() => null);
    for (let attempt = 0; attempt < 2 && !expanded; attempt++) {
      const expandResult = await runExpand(attempt);
      const expandedParsed = expandResult ? parseArticleDraft(expandResult.output.text) : null;
      if (expandedParsed && required.every((l) => expandedParsed[l])) {
        workingArticle = expandedParsed;
        activeLlm = expandResult;
        expanded = true;
        wordCount = countWords(workingArticle);
        await supabase.from('content_research_logs').insert({
          session_id: sessionId,
          stage: 'developing',
          level: 'info',
          message: `article topic ${topicId} expanded (thin repair${attempt > 0 ? ' retry' : ''}): ${Object.entries(wordCount).map(([l, w]) => `${l}:${w}`).join(', ')} kata`
        });
      } else if (attempt === 0) {
        await supabase.from('content_research_logs').insert({
          session_id: sessionId,
          stage: 'developing',
          level: 'warn',
          message: `article topic ${topicId} expand repair gagal diparse — coba sekali lagi`
        });
      }
    }
    if (!expanded) {
      await supabase.from('content_research_logs').insert({
        session_id: sessionId,
        stage: 'developing',
        level: 'warn',
        message: `article topic ${topicId} expand repair gagal diparse 2x — pakai draf awal`
      });
    }
  }

  const finalArticle = replaceAffiliateUrls(workingArticle);
  const resolvedLlm = activeLlm!;

  // Audit emoji lunak (aturan baru: excerpt + tiap section 1 emoji).
  const emojiGaps = auditArticleEmoji(finalArticle);
  if (emojiGaps.length > 0) {
    await supabase.from('content_research_logs').insert({
      session_id: sessionId,
      stage: 'developing',
      level: 'warn',
      message: `article topic ${topicId} emoji kurang di ${emojiGaps.length} bagian (${emojiGaps.slice(0, 6).map((g) => `${g.lang}:${g.part}`).join(', ')}) — draf disimpan dengan tanda`
    });
  }

  // Gate lunak jumlah kata: di bawah minimum tetap disimpan + ditandai
  // (publish yang menolak) agar sesi tidak gagal sunyi.
  const thinContent = Object.values(wordCount).some((w) => w < ARTICLE_MIN_WORDS);
  if (thinContent) {
    await supabase.from('content_research_logs').insert({
      session_id: sessionId,
      stage: 'developing',
      level: 'warn',
      message: `article topic ${topicId} thin content (${Object.entries(wordCount).map(([l, w]) => `${l}:${w}`).join(', ')} kata, minimum ${ARTICLE_MIN_WORDS}) — draf disimpan dengan tanda, perbaiki sebelum publish`
    });
  }

  const providerId = await lookupProviderId(supabase, resolvedLlm.providerSlug);

  const injection = affiliate
    ? [
        {
          friendly_code: affiliate.product.friendly_code,
          url: affiliate.product.url,
          post_index: 0,
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

  const minimalThread = buildArticleMinimalThread(finalArticle);

  const { data: createdDraft, error: draftError } = await supabase.from('content_drafts').insert({
    request_id: sessionId,
    provider_id: providerId,
    model_id: resolvedLlm.model,
    research_topic_id: topicId,
    platform_slug: 'artikel',
    product_id: fixedProductId ?? null,
    generated_thread: minimalThread as unknown as Record<string, unknown>,
    article_draft: finalArticle as unknown as Record<string, unknown>,
    affiliate_injections: injection as unknown as Record<string, unknown>[],
    status: 'needs_review',
    llm_meta: {
      provider: resolvedLlm.providerSlug,
      model: resolvedLlm.model,
      latency_ms: resolvedLlm.latencyMs,
      key_hash: resolvedLlm.keyHash,
      platform: 'artikel',
      word_count: wordCount,
      thin_content: thinContent,
      expanded,
      emoji_missing: emojiGaps.length > 0,
      emoji_gaps: emojiGaps.slice(0, 12),
      language
    },
    affiliate_match_score: fixedProductId ? null : (affiliate?.matchScore ?? null),
    affiliate_match_signals: affiliate
      ? (affiliate.signals as unknown as Record<string, unknown>)
      : null
  }).select('id').single();
  if (draftError || !createdDraft) {
    const msg = draftError?.message ?? 'draft insert returned no id';
    await supabase.from('content_research_logs').insert({
      session_id: sessionId,
      stage: 'developing',
      level: 'error',
      message: `article draft insert failed: ${msg}`
    });
    throw new Error(`draft insert failed: ${msg}`);
  }
  const newDraftId = (createdDraft as { id: string }).id;

  // Kirim prompt cover (jika ada) agar worker review langsung bisa render tanpa reasoning LLM tambahan.
  await enqueueCoverImage(supabase, sessionId, newDraftId, finalArticle.cover_image_prompt);

  await supabase.from('content_research_logs').insert({
    session_id: sessionId,
    stage: 'developing',
    level: 'info',
    message: affiliate
      ? `article draft generated [artikel]${fixedProductId ? ' [fixed]' : ''} with affiliate ${affiliate.product.friendly_code} (${Object.entries(wordCount).map(([l, w]) => `${l}:${w}`).join(', ')} kata)${thinContent ? ' THIN-CONTENT' : ''}${expanded ? ' EXPANDED' : ''}${emojiGaps.length > 0 ? ' EMOJI-MISSING' : ''}`
      : `article draft generated [artikel] without affiliate (empty pool)`
  });
}
