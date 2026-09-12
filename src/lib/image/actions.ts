'use server';

import { revalidatePath } from 'next/cache';
import { isAdmin } from '@/lib/auth/is-admin';
import { createSupabaseService } from '@/lib/supabase/server';
import { REFERENCE_IMAGE_ALLOWED_MIME, REFERENCE_IMAGE_MAX_BYTES, clampImg2ImgStrength } from './types';
import { uploadDraftReference } from './storage';
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
 * Override manual enqueue dari review (cover + per-reply): pin model/style/
 * kamera + prompt edit + referensi img2img opsional.
 */
export interface ImageEnqueueOverride {
  modelUuid?: string | null;
  styleSlug?: string | null;
  cameraSlug?: string | null;
  imagePrompt?: string | null;
  negativePrompt?: string | null;
  /** Kekuatan img2img 0–1 (hanya bermakna bila referensi diisi). */
  referenceStrength?: number | null;
  /** Public URL referensi: upload baru atau histori draf ini. */
  referencePublicUrl?: string | null;
  /** Path storage referensi bila sudah di-upload (hemat re-upload). */
  referenceStoragePath?: string | null;
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
  override?: ImageEnqueueOverride
): Promise<{ imageId: string }> {
  return generatePostImage(draftId, 0, override);
}

/**
 * Upload file referensi img2img untuk draf → `draft-images/ref/`.
 * Validasi: admin, mime JPEG/PNG/WebP, size ≤5MB.
 */
export async function uploadDraftImageReference(
  draftId: string,
  formData: FormData
): Promise<{ storagePath: string; publicUrl: string }> {
  const supabase = await requireAdmin();
  if (!draftId) throw new Error('draftId required');
  const { data: draft } = await supabase.from('content_drafts').select('id').eq('id', draftId).maybeSingle();
  if (!draft) throw new Error('draft not found');
  const file = formData.get('file');
  if (!(file instanceof File)) throw new Error('File referensi wajib diisi.');
  if (!file.size || file.size <= 0) throw new Error('File referensi kosong.');
  if (file.size > REFERENCE_IMAGE_MAX_BYTES) {
    throw new Error('Referensi maksimal 5MB — kecilkan dulu.');
  }
  if (!(REFERENCE_IMAGE_ALLOWED_MIME as readonly string[]).includes(file.type.toLowerCase())) {
    throw new Error('Referensi harus gambar JPEG/PNG/WebP.');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const refId = typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}`;
  return uploadDraftReference(draftId, refId, bytes, file.type);
}

/**
 * Enqueue generate untuk 1 reply (post_index ≥ 1). Opt-in manual dari review;
 * reply afiliasi ditolak (tetap pakai gambar produk). Mode global/sesi/draf
 * `per-reply-opt-in` wajib aktif kecuali untuk cover (post 0).
 */
export async function generatePostImage(
  draftId: string,
  postIndex: number,
  override?: ImageEnqueueOverride
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
  let cameraSlug: string | null = null;
  if (override?.cameraSlug) {
    const slug = override.cameraSlug.trim().slice(0, 120);
    if (slug) {
      const { data: cam } = await supabase
        .from('image_camera_angles')
        .select('slug')
        .eq('slug', slug)
        .eq('is_active', true)
        .maybeSingle();
      if (!cam) throw new Error('camera angle tidak aktif — refresh pilihan');
      cameraSlug = slug;
    }
  }
  // Referensi img2img: URL harus berasal dari histori draf yang sama
  // (public_url hasil sendiri ATAU referensi sebelumnya) — cegah tempel URL asing.
  const referenceUrl = override?.referencePublicUrl?.trim().slice(0, 2048) || null;
  let referenceStoragePath: string | null = override?.referenceStoragePath?.trim().slice(0, 1024) || null;
  if (referenceUrl) {
    const { data: owned } = await supabase
      .from('content_draft_images')
      .select('reference_storage_path, storage_path')
      .eq('draft_id', draftId)
      .or(`public_url.eq.${referenceUrl},reference_public_url.eq.${referenceUrl}`)
      .limit(1)
      .maybeSingle();
    if (!owned) throw new Error('Referensi harus dari upload atau histori draf ini.');
    const own = owned as { reference_storage_path: string | null; storage_path: string | null } | null;
    if (!referenceStoragePath) {
      referenceStoragePath = own?.reference_storage_path ?? own?.storage_path ?? null;
    }
  }
  const referenceStrength = referenceUrl ? clampImg2ImgStrength(override?.referenceStrength) : null;
  const { data: created, error } = await supabase
    .from('content_draft_images')
    .insert({
      draft_id: draftId,
      post_index: postIndex,
      image_prompt: hasCustom ? customPrompt : '',
      negative_prompt: hasCustom ? (customNegative || null) : null,
      provider_slug: '',
      model_id: '',
      camera_slug: cameraSlug,
      reference_public_url: referenceUrl,
      reference_storage_path: referenceStoragePath,
      reference_strength: referenceStrength,
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

/**
 * Ulangi image yang failed (generik — mis. image_prompt no JSON): kembalikan ke
 * antrean pending agar worker cron memproses ulang (attempts direset).
 * Hanya baris failed; baris aktif (pending/prompt_ready/ready/selected) ditolak
 * agar tidak duplikat antrean.
 */
export async function retryFailedImage(imageId: string): Promise<{ imageId: string }> {
  const supabase = await requireAdmin();
  if (!imageId) throw new Error('imageId required');
  const { data: row } = await supabase
    .from('content_draft_images')
    .select('id, status, draft_id')
    .eq('id', imageId)
    .maybeSingle();
  const r = row as { id: string; status: string; draft_id: string } | null;
  if (!r) throw new Error('image not found');
  if (r.status !== 'failed') throw new Error('hanya image failed yang bisa diulang');
  const { error } = await supabase
    .from('content_draft_images')
    .update({ status: 'pending', attempts: 0, last_error: null, updated_at: new Date().toISOString() })
    .eq('id', imageId)
    .eq('status', 'failed');
  if (error) throw new Error(error.message);
  revalidatePath('/konten/review');
  revalidatePath('/konten/review/[draftId]', 'page');
  return { imageId };
}

export interface SuggestPromptResult {
  prompt: string;
  subjectSlug: string;
  subjectName: string;
  scene: { activity: string; setting: string; objects: string[] };
}

/**
 * Siapkan prompt awal dari template subjek + scene postingan (tanpa insert DB).
 * Micro-LLM mengekstrak activity/setting/objects (JSON ≤150 token, stage
 * image_prompt agar ikut waterfall + audit); gabungan deterministik via
 * composeSubjectPrompt. Hasil untuk textarea → Sempurnakan → Generate.
 */
export async function suggestImagePrompt(
  draftId: string,
  postIndex: number,
  subjectSlug?: string | null,
  cameraSlug?: string | null
): Promise<SuggestPromptResult> {
  const supabase = await requireAdmin();
  if (!draftId) throw new Error('draftId required');
  if (!Number.isInteger(postIndex) || postIndex < 0) throw new Error('postIndex must be >= 0');

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

  const { data: tpl } = await supabase
    .from('image_subject_templates')
    .select('slug, display_name, subject_en')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  const templates = (tpl ?? []) as { slug: string; display_name: string; subject_en: string }[];
  const subject =
    (subjectSlug ? templates.find((t) => t.slug === subjectSlug) : undefined) ?? templates[0] ?? null;
  if (!subject) throw new Error('tidak ada template subjek aktif');

  // Camera angle opsional: tanpa pilihan = prompt tanpa angle (worker nanti
  // menambah dari kamera baris bila generate memakai camera_slug).
  let angleEn: string | null = null;
  if (cameraSlug) {
    const { data: cam } = await supabase
      .from('image_camera_angles')
      .select('angle_en')
      .eq('slug', cameraSlug)
      .eq('is_active', true)
      .maybeSingle();
    const found = (cam as { angle_en?: string } | null)?.angle_en?.trim();
    if (!found) throw new Error('camera angle tidak aktif — refresh pilihan');
    angleEn = found;
  }

  let sessionId: string | null = null;
  if (d.research_topic_id) {
    const { data: topic } = await supabase
      .from('content_research_topics')
      .select('session_id')
      .eq('id', d.research_topic_id)
      .maybeSingle();
    sessionId = (topic as { session_id: string } | null)?.session_id ?? null;
  }

  const { buildSceneMessages, parseSceneJson, composeSubjectPrompt } = await import('./subjects');
  const { resolveStageModel } = await import('@/lib/llm/stage-defaults');
  const { runLLMCompletion } = await import('@/lib/llm/completion');
  const svc = (await import('@/lib/supabase/service')).getServiceClient();

  const { system, user } = buildSceneMessages(sourcePost.id ?? '', sourcePost.en ?? '');
  const { providerId, modelUuid } = await resolveStageModel('image_prompt', null);
  const out = await runLLMCompletion(svc, {
    stage: 'image_prompt',
    providerId,
    modelUuid,
    messages: [
      { role: 'system' as const, content: system },
      { role: 'user' as const, content: user }
    ],
    temperature: 0.3,
    maxTokens: 150,
    sessionId
  });
  let scene;
  try {
    scene = parseSceneJson(out.output.text);
  } catch {
    throw new Error('gagal ekstrak scene postingan — coba lagi');
  }
  let prompt = composeSubjectPrompt(subject.subject_en, scene);
  if (angleEn) {
    const { appendCameraAngle } = await import('./camera-angles');
    // Textarea review max 500 → potong prompt, jaga angle utuh.
    prompt = appendCameraAngle(prompt, angleEn, 500);
  }
  return {
    prompt,
    subjectSlug: subject.slug,
    subjectName: subject.display_name,
    scene
  };
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
