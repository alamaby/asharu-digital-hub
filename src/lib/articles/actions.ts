'use server';

import { revalidatePath } from 'next/cache';
import { isAdmin } from '@/lib/auth/is-admin';
import { createSupabaseService } from '@/lib/supabase/server';
import {
  ARTICLE_MIN_WORDS,
  countArticleWords,
  parseArticleDraft,
  type ParsedArticleDraft
} from '@/lib/llm/prompt';
import type { ArticleLocale } from './types';
import { publishArticleDraftCore } from './publish';

export type { ArticlePublishResult } from './publish';
import type { ArticlePublishResult } from './publish';

/**
 * Publish draf artikel (platform `artikel`) menjadi 1-2 baris `articles`
 * sesuai bahasa yang diminta. Gate admin + revalidate; logika inti ada di
 * `publishArticleDraftCore` (dipakai juga oleh automation cron).
 * Idempoten per (draft_id, locale) via upsert.
 */
export async function approveArticleAndPublish(
  draftId: string,
  locales: ArticleLocale[]
): Promise<ArticlePublishResult> {
  if (!(await isAdmin())) {
    return { success: false, error: 'forbidden' };
  }
  const supabase = createSupabaseService();
  if (!supabase) return { success: false, error: 'Supabase not configured' };

  const result = await publishArticleDraftCore(supabase, draftId, locales);
  if (!result.success) return result;

  revalidatePath('/konten/review');
  revalidatePath('/konten/review/[draftId]', 'page');
  revalidatePath('/artikel');
  revalidatePath('/artikel/[slug]', 'page');

  return result;
}

/** Arsipkan artikel (tarik dari publik tanpa hapus baris). */
export async function archiveArticle(articleId: string): Promise<{ success: boolean; error?: string }> {
  if (!(await isAdmin())) return { success: false, error: 'forbidden' };
  const supabase = createSupabaseService();
  if (!supabase) return { success: false, error: 'Supabase not configured' };
  const { error } = await supabase
    .from('articles')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', articleId);
  if (error) return { success: false, error: error.message };
  revalidatePath('/artikel');
  revalidatePath('/artikel/[slug]', 'page');
  return { success: true };
}

export interface ArticleExpandResult {
  success: boolean;
  /** Jumlah kata per bahasa setelah expand. */
  words?: Record<string, number>;
  /** True bila LLM dipanggil; false bila artikel sudah ≥ minimum. */
  expanded?: boolean;
  error?: string;
}

/**
 * Kembangkan draf artikel thin-content (< ARTICLE_MIN_WORDS) via LLM hingga
 * ≥800 kata per bahasa. Fakta/slug/posisi afiliasi dipertahankan; URL
 * afiliasi final dikembalikan ke placeholder sebelum dikirim ke LLM lalu
 * dipulihkan setelah parse. Untuk repair manual kasus 419a2dc8 (488 kata).
 */
export async function expandArticleDraft(
  draftId: string,
  opts?: { modelId?: string | null }
): Promise<ArticleExpandResult> {
  if (!(await isAdmin())) {
    return { success: false, error: 'forbidden' };
  }
  const supabase = createSupabaseService();
  if (!supabase) return { success: false, error: 'Supabase not configured' };
  if (!draftId) return { success: false, error: 'draftId required' };

  // Rate limit 10/jam untuk non-admin (admin bypass — pola enhanceImagePrompt).
  // Halaman review admin-only, tapi action tetap dijaga bila dipanggil di luar.
  const { headers } = await import('next/headers');
  const hdrs = await headers();
  const { getClientIp, checkRateLimit, incrementRateLimit } = await import('@/lib/content/rate-limit');
  const ip = getClientIp(hdrs);
  const isAdminUser = await isAdmin().catch(() => false);
  if (!isAdminUser) {
    const { allowed, count } = await checkRateLimit(ip, 'expand_article', 10);
    if (!allowed) return { success: false, error: `rate_limit:${count} — expand 10/jam` };
  }

  const { data: draft, error: draftError } = await supabase
    .from('content_drafts')
    .select('id, status, platform_slug, article_draft, research_topic_id, product_id, llm_meta, affiliate_injections')
    .eq('id', draftId)
    .maybeSingle();
  if (draftError || !draft) {
    return { success: false, error: draftError?.message ?? 'draft not found' };
  }
  const d = draft as {
    id: string;
    status: string;
    platform_slug: string | null;
    article_draft: ParsedArticleDraft | null;
    research_topic_id: string | null;
    product_id: string | null;
    llm_meta: Record<string, unknown> | null;
    affiliate_injections: Array<{ url: string; friendly_code: string }> | null;
  };
  if (d.platform_slug !== 'artikel' || !d.article_draft) {
    return { success: false, error: 'draft is not an article draft' };
  }

  let sessionLanguage: string | null = null;
  let sessionId: string | null = null;
  let topicTitle = '';
  if (d.research_topic_id) {
    const { data: topicRow } = await supabase
      .from('content_research_topics')
      .select('id, session_id, topic, content_research_sessions!inner(language)')
      .eq('id', d.research_topic_id)
      .maybeSingle();
    const t = topicRow as unknown as {
      session_id: string;
      topic: string;
      content_research_sessions: { language: string | null };
    } | null;
    if (t) {
      sessionId = t.session_id;
      sessionLanguage = t.content_research_sessions?.language ?? null;
      topicTitle = t.topic ?? '';
    }
  }
  const langs = (!sessionLanguage || sessionLanguage === 'both')
    ? (['id', 'en'] as const).filter((l) => d.article_draft?.[l])
    : ([sessionLanguage] as Array<'id' | 'en'>);

  const words: Record<string, number> = {};
  for (const l of langs) {
    const a = d.article_draft[l];
    if (a) words[l] = countArticleWords(a);
  }
  if (Object.values(words).every((w) => w >= ARTICLE_MIN_WORDS)) {
    return { success: true, words, expanded: false };
  }

  const affiliateUrl = (Array.isArray(d.affiliate_injections) ? d.affiliate_injections[0]?.url : null) ?? null;
  const friendlyCode = (Array.isArray(d.affiliate_injections) ? d.affiliate_injections[0]?.friendly_code : null) ?? 'NONE';
  // Kembalikan URL final → placeholder agar prompt expand konsisten.
  const placeholdered = affiliateUrl
    ? (JSON.parse(JSON.stringify(d.article_draft).split(affiliateUrl).join('{{PRODUCT_URL}}')) as ParsedArticleDraft)
    : d.article_draft;
  // Nama produk untuk blok konteks (faktual dari DB, fallback kode).
  let productName = friendlyCode;
  if (d.product_id) {
    const { data: prodRow } = await supabase
      .from('affiliate_products')
      .select('name_id')
      .eq('id', d.product_id)
      .maybeSingle();
    const prodName = (prodRow as { name_id: string } | null)?.name_id;
    if (prodName) productName = prodName;
  }

  const { buildArticleExpandPrompt: buildExpand } = await import('@/lib/llm/prompt');
  const { system, user } = buildExpand(
    { topic: topicTitle || 'artikel', language: sessionLanguage ?? 'both', wordCount: words },
    placeholdered,
    { friendlyCode, name: productName, url: affiliateUrl ?? 'https://example.com', category: '-' }
  );
  const { resolveStageModel } = await import('@/lib/llm/stage-defaults');
  const { runLLMCompletion } = await import('@/lib/llm/completion');
  // Model pin pilihan admin (dropdown review) > default stage > waterfall
  // global. Pin yang nonaktif ditolak eksplisit (jangan silent-fallback).
  const pinnedModelId = opts?.modelId?.trim() || null;
  let expandModelLabel: string | null = null;
  if (pinnedModelId) {
    const { data: pinned } = await supabase
      .from('llm_models')
      .select('id, model_id, is_active')
      .eq('id', pinnedModelId)
      .maybeSingle();
    const pinnedRow = pinned as { id: string; model_id: string; is_active: boolean } | null;
    if (!pinnedRow) return { success: false, error: 'model pilihan tidak ditemukan — refresh pilihan' };
    if (!pinnedRow.is_active) return { success: false, error: 'model pilihan nonaktif — pilih model lain' };
    expandModelLabel = pinnedRow.model_id;
  }
  const { providerId, modelUuid } = await resolveStageModel('developing', pinnedModelId);
  let out: string;
  try {
    const res = await runLLMCompletion(supabase, {
      stage: 'developing',
      providerId,
      modelUuid,
      messages: [
        { role: 'system' as const, content: system },
        { role: 'user' as const, content: user }
      ],
      temperature: 0.7,
      maxTokens: 6000,
      sessionId
    });
    out = res.output.text;
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
  const parsed = parseArticleDraft(out);
  if (!parsed || langs.some((l) => !parsed[l])) {
    return { success: false, error: `expand gagal diparse atau bahasa ${langs.join('/')} tak lengkap` };
  }
  // Pulihkan placeholder → URL final.
  const finalArticle = affiliateUrl
    ? (JSON.parse(JSON.stringify(parsed).split('{{PRODUCT_URL}}').join(affiliateUrl)) as ParsedArticleDraft)
    : parsed;
  const newWords: Record<string, number> = {};
  for (const l of langs) {
    const a = finalArticle[l];
    if (a) newWords[l] = countArticleWords(a);
  }
  const { error: updateError } = await supabase
    .from('content_drafts')
    .update({
      article_draft: finalArticle as unknown as Record<string, unknown>,
      llm_meta: {
        ...(d.llm_meta ?? {}),
        word_count: newWords,
        thin_content: Object.values(newWords).some((w) => w < ARTICLE_MIN_WORDS),
        expanded: true,
        expanded_at: new Date().toISOString(),
        expand_model: expandModelLabel
      }
    })
    .eq('id', draftId);
  if (updateError) return { success: false, error: updateError.message };

  if (!isAdminUser) await incrementRateLimit(ip, 'expand_article').catch(() => {});

  revalidatePath('/konten/review');
  revalidatePath('/konten/review/[draftId]', 'page');
  return { success: true, words: newWords, expanded: true };
}
