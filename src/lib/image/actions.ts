'use server';

import { revalidatePath } from 'next/cache';
import { isAdmin } from '@/lib/auth/is-admin';
import { createSupabaseService } from '@/lib/supabase/server';
import type { DraftImageRow } from './types';

async function requireAdmin() {
  if (!(await isAdmin())) throw new Error('Unauthorized: admin only');
  const supabase = createSupabaseService();
  if (!supabase) throw new Error('Supabase not configured');
  return supabase;
}

/** Ambil history image 1 draf (terbaru dulu) + selected. */
export async function listDraftImages(draftId: string): Promise<DraftImageRow[]> {
  const supabase = await requireAdmin();
  const { data, error } = await supabase
    .from('content_draft_images')
    .select('*')
    .eq('draft_id', draftId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as DraftImageRow[];
}

/**
 * Enqueue generate cover (post 0) atau regenerate dengan override manual.
 * Worker cron memproses antrean; tidak blocking.
 * - imagePrompt diisi (user sudah cek/edit): worker langsung generate image.
 * - imagePrompt kosong: worker hanya menyiapkan draf prompt otomatis
 *   (status prompt_ready) TANPA generate — user cek/edit dulu lalu Generate.
 */
export async function generateDraftImage(
  draftId: string,
  override?: { modelUuid?: string | null; styleSlug?: string | null; imagePrompt?: string | null; negativePrompt?: string | null }
): Promise<{ imageId: string }> {
  return generatePostImage(draftId, 0, override);
}

/**
 * Enqueue generate untuk 1 reply (post_index ≥ 1). Opt-in manual dari review;
 * reply afiliasi ditolak (tetap pakai gambar produk). Mode global/sesi/draf
 * `per-reply-opt-in` wajib aktif kecuali untuk cover (post 0).
 */
export async function generatePostImage(
  draftId: string,
  postIndex: number,
  override?: { modelUuid?: string | null; styleSlug?: string | null; imagePrompt?: string | null; negativePrompt?: string | null }
): Promise<{ imageId: string }> {
  const supabase = await requireAdmin();
  if (!draftId) throw new Error('draftId required');
  if (!Number.isInteger(postIndex) || postIndex < 0) throw new Error('postIndex must be >= 0');
  const customPrompt = override?.imagePrompt?.trim().slice(0, 500) ?? '';
  const customNegative = override?.negativePrompt?.trim().slice(0, 300) ?? '';
  if (customPrompt && customPrompt.length < 10) throw new Error('image prompt minimal 10 karakter (EN, ≤60 kata)');
  const { data: draft } = await supabase
    .from('content_drafts')
    .select('id, generated_thread, affiliate_injections, image_mode, research_topic_id')
    .eq('id', draftId)
    .maybeSingle();
  if (!draft) throw new Error('draft not found');
  const d = draft as {
    generated_thread: { main: { id: string; en: string }; replies: { id: string; en: string }[] };
    affiliate_injections: { post_index: number }[];
    image_mode: string | null;
    research_topic_id: string | null;
  };
  const posts = [d.generated_thread.main, ...d.generated_thread.replies];
  if (!posts[postIndex]) throw new Error(`post ${postIndex} not found`);
  const affiliateIdx = d.affiliate_injections?.[0]?.post_index;
  if (postIndex > 0 && affiliateIdx === postIndex) {
    throw new Error('reply afiliasi memakai gambar produk — generate ditolak');
  }
  if (postIndex > 0 && !(await isPerReplyEnabled(d))) {
    throw new Error('mode per-reply belum aktif (image_gen_defaults / sesi / draf)');
  }
  const hasCustom = Boolean(customPrompt);
  const { data: created, error } = await supabase
    .from('content_draft_images')
    .insert({
      draft_id: draftId,
      post_index: postIndex,
      image_prompt: hasCustom ? customPrompt : '',
      negative_prompt: hasCustom ? (customNegative || null) : null,
      provider_slug: '',
      model_id: '',
      reasoning: hasCustom ? { visual_strategy: 'custom', justification: 'user_edited' } : null,
      llm_meta: override ? { override } : {}
    })
    .select('id')
    .single();
  if (error || !created) throw new Error(error?.message ?? 'enqueue failed');
  revalidatePath('/konten/review');
  revalidatePath('/konten/review/[draftId]', 'page');
  return { imageId: (created as { id: string }).id };
}

  async function isPerReplyEnabled(d: { image_mode: string | null; research_topic_id: string | null }): Promise<boolean> {
  const { isPerReplyMode } = await import('./config');
  const supabase = createSupabaseService();
  let sessionId: string | null = null;
  if (supabase && d.research_topic_id && !d.image_mode) {
    const { data: topic } = await supabase
      .from('content_research_topics')
      .select('session_id')
      .eq('id', d.research_topic_id)
      .maybeSingle();
    sessionId = (topic as { session_id: string } | null)?.session_id ?? null;
  }
  return isPerReplyMode({ draftMode: d.image_mode, sessionId });
}

export interface EnhancePromptResult {
  image_prompt: string;
  negative_prompt?: string;
  reasoning: { visual_strategy: string; hook_keywords?: string[]; contradiction_check?: string; justification?: string };
}

/**
 * Enhance (polish) prompt yang sudah diketik user di review — side-by-side.
 * Hanya bila sudah ada draf prompt (≥10 char), tanpa insert DB.
 * Stage: enhance_image_prompt (picker Admin→LLM), limit 30/jam, admin bypass.
 * styleSlug: bila diisi, style hint (suffix) mengikuti pilihan picker review,
 * bukan default global.
 */
export async function enhanceImagePrompt(
  draftId: string,
  postIndex: number,
  promptDraft: string,
  negativeDraft?: string | null,
  styleSlug?: string | null
): Promise<EnhancePromptResult> {
  const supabase = await requireAdmin();
  const draftPrompt = promptDraft?.trim() ?? '';
  if (!draftPrompt || draftPrompt.length < 10) throw new Error('prompt minimal 10 karakter (isi dulu di textarea)');
  if (draftPrompt.length > 500) throw new Error('prompt maksimal 500 karakter');
  const negDraft = negativeDraft?.trim().slice(0, 300) ?? null;
  if (!draftId) throw new Error('draftId required');
  if (!Number.isInteger(postIndex) || postIndex < 0) throw new Error('postIndex must be >= 0');

  // Rate limit 30/jam — admin bypass
  const { headers } = await import('next/headers');
  const hdrs = await headers();
  const { getClientIp, checkRateLimit, incrementRateLimit } = await import('@/lib/content/rate-limit');
  const ip = getClientIp(hdrs);
  const isAdminUser = await isAdmin().catch(() => false);
  if (!isAdminUser) {
    const { allowed, count } = await checkRateLimit(ip, 'enhance_image_prompt', 30);
    if (!allowed) throw new Error(`rate_limit:${count} — enhance 30/jam`);
  }

  const { data: draft } = await supabase
    .from('content_drafts')
    .select('id, generated_thread, research_topic_id')
    .eq('id', draftId)
    .maybeSingle();
  if (!draft) throw new Error('draft not found');
  const d = draft as {
    generated_thread: { main: { id: string; en: string }; replies: { id: string; en: string }[] };
    research_topic_id: string | null;
  };
  const posts = [d.generated_thread.main, ...d.generated_thread.replies];
  const sourcePost = posts[postIndex];
  if (!sourcePost) throw new Error(`post ${postIndex} not found`);

  let sessionId: string | null = null;
  let topicTitle: string | null = null;
  if (d.research_topic_id) {
    const { data: topic } = await supabase
      .from('content_research_topics')
      .select('session_id, topic')
      .eq('id', d.research_topic_id)
      .maybeSingle();
    const t = topic as { session_id: string; topic: string } | null;
    sessionId = t?.session_id ?? null;
    topicTitle = t?.topic ?? null;
  }

  const { resolveImageTarget } = await import('./config');
  const target = await resolveImageTarget({
    sessionId,
    draftOverride: styleSlug ? { styleSlug } : null
  });
  const styleSuffix = target.style?.prompt_suffix ?? null;

  const { buildEnhancePromptMessages, parseImagePrompt, validateImagePromptContradiction } = await import('./prompt');
  const { resolveStageModel } = await import('@/lib/llm/stage-defaults');
  const { runLLMCompletion } = await import('@/lib/llm/completion');
  const svc = (await import('@/lib/supabase/service')).getServiceClient();

  const { system, user } = buildEnhancePromptMessages({
    sourceId: sourcePost.id ?? '',
    sourceEn: sourcePost.en ?? '',
    promptDraft: draftPrompt.slice(0, 500),
    negativeDraft: negDraft,
    topic: topicTitle ?? undefined,
    styleSuffix: styleSuffix ?? undefined,
    postIndex
  });

  const { providerId, modelUuid } = await resolveStageModel('enhance_image_prompt', null);
  const sourceText = `${sourcePost.id ?? ''} ${sourcePost.en ?? ''}`;

  async function attempt(temperature: number, gateNote?: string) {
    const msgs = [
      { role: 'system' as const, content: system },
      { role: 'user' as const, content: gateNote ? `${user}\n\nPENTING: output sebelumnya gagal gate (${gateNote}). Perbaiki visual_strategy + image_prompt + negative_prompt.` : user }
    ];
    const out = await runLLMCompletion(svc, {
      stage: 'enhance_image_prompt',
      providerId,
      modelUuid,
      messages: msgs,
      temperature,
      maxTokens: 500,
      sessionId
    });
    return { parsed: parseImagePrompt(out.output.text), raw: out.output.text };
  }

  let chosen = await attempt(0.5);
  const gate = validateImagePromptContradiction(
    { image_prompt: chosen.parsed.image_prompt, negative_prompt: chosen.parsed.negative_prompt, reasoning: chosen.parsed.reasoning },
    sourceText
  );
  if (!gate.ok) {
    const retry = await attempt(0.3, gate.reasons.join('; '));
    const gate2 = validateImagePromptContradiction(
      { image_prompt: retry.parsed.image_prompt, negative_prompt: retry.parsed.negative_prompt, reasoning: retry.parsed.reasoning },
      sourceText
    );
    if (!gate2.ok) throw new Error(`enhance gate: ${[...gate.reasons, ...gate2.reasons].join(' | ').slice(0, 500)}`);
    chosen = retry;
  }

  if (!isAdminUser) await incrementRateLimit(ip, 'enhance_image_prompt').catch(() => {});

  return {
    image_prompt: chosen.parsed.image_prompt,
    negative_prompt: chosen.parsed.negative_prompt,
    reasoning: chosen.parsed.reasoning
  };
}

/** Pilih 1 image sebagai selected untuk post itu (cover = post 0 untuk social). */
export async function selectDraftImage(draftId: string, imageId: string): Promise<void> {
  const supabase = await requireAdmin();
  const { data: row } = await supabase
    .from('content_draft_images')
    .select('id, draft_id, post_index, status')
    .eq('id', imageId)
    .eq('draft_id', draftId)
    .maybeSingle();
  if (!row) throw new Error('image not found for draft');
  const r = row as { post_index: number; status: string };
  if (r.status !== 'ready' && r.status !== 'selected') {
    throw new Error('only ready images can be selected');
  }
  await supabase
    .from('content_draft_images')
    .update({ status: 'ready', updated_at: new Date().toISOString() })
    .eq('draft_id', draftId)
    .eq('post_index', r.post_index)
    .eq('status', 'selected');
  const { error } = await supabase
    .from('content_draft_images')
    .update({ status: 'selected', updated_at: new Date().toISOString() })
    .eq('id', imageId);
  if (error) throw new Error(error.message);
  if (r.post_index === 0) {
    await supabase.from('content_drafts').update({ selected_image_id: imageId }).eq('id', draftId);
    // Teruskan ke antrean social yang masih queued (aditif, upsert kolom saja).
    await supabase
      .from('social_post_queue')
      .update({ image_url: (await selectedPublicUrl(imageId)) ?? null })
      .eq('draft_id', draftId)
      .eq('status', 'queued');
  } else {
    await syncQueueImageUrls(draftId);
  }
  revalidatePath('/konten/review');
  revalidatePath('/konten/review/[draftId]', 'page');
}

/** Sinkronkan peta image per index ke antrean queued (kolom image_urls jsonb). */
async function syncQueueImageUrls(draftId: string): Promise<void> {
  const supabase = createSupabaseService();
  if (!supabase) return;
  const { data } = await supabase
    .from('content_draft_images')
    .select('post_index, public_url')
    .eq('draft_id', draftId)
    .eq('status', 'selected');
  const map: Record<string, string> = {};
  for (const r of ((data ?? []) as { post_index: number; public_url: string | null }[])) {
    if (r.public_url) map[String(r.post_index)] = r.public_url;
  }
  if (Object.keys(map).length === 0) return;
  await supabase
    .from('social_post_queue')
    .update({ image_urls: map })
    .eq('draft_id', draftId)
    .eq('status', 'queued');
}

async function selectedPublicUrl(imageId: string): Promise<string | null> {
  const supabase = createSupabaseService();
  if (!supabase) return null;
  const { data } = await supabase
    .from('content_draft_images')
    .select('public_url')
    .eq('id', imageId)
    .maybeSingle();
  return ((data as { public_url: string | null } | null)?.public_url ?? null) || null;
}
