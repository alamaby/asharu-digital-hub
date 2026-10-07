'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/require-user';
import { createSupabaseService } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/supabase/service';
import { runLLMCompletion } from '@/lib/llm/completion';
import { resolveStageModel } from '@/lib/llm/stage-defaults';
import { buildStudioEnhanceMessages, parseImagePrompt, validateImagePromptContradiction } from '@/lib/image/prompt';
import { consumeRateLimit, getClientIp } from '@/lib/content/rate-limit';
import {
  DEFAULT_STUDIO_CONFIG,
  type StudioConfig,
  type StudioGenerationRow,
  type StudioListOptions,
  type StudioOptions,
  type StudioQuota,
  type StudioEnhanceResult,
  type StudioBatchWithCounts
} from './types';
import { buildStudioExpiry, checkStudioQuota, quotaExceededMessage, studioInputSchema, validateProviderModelLink, validateReferenceModelLink, checkStudioQuotaForBatch, validateBatchPrompts } from './validation';
import { removeUserImage, uploadUserReference, resolveFreshReferenceStoragePath, assertFreshReferenceExists } from './storage';
import {
  REFERENCE_IMAGE_ALLOWED_MIME,
  REFERENCE_IMAGE_MAX_BYTES,
  clampImg2ImgStrength,
  modelSupportsReference
} from '@/lib/image/types';

function svc() {
  const supabase = createSupabaseService();
  if (!supabase) throw new Error('Supabase belum dikonfigurasi.');
  return supabase;
}

/**
 * Hasil server action Studio. Error dikembalikan sebagai data (`ok:false`),
 * BUKAN di-throw: Next.js production menyamarkan error yang dilempar dari
 * Server Action menjadi digest generik ("An error occurred in the Server
 * Components render"), sehingga pesan asli tak sampai ke UI.
 */
export type StudioActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

/** Baca config studio (service_role; fallback default bila tabel belum ada). */
export async function getStudioConfig(): Promise<StudioConfig> {
  try {
    const { data } = await svc().from('image_studio_config').select('*').eq('id', 1).maybeSingle();
    if (!data) return DEFAULT_STUDIO_CONFIG;
    return { ...DEFAULT_STUDIO_CONFIG, ...(data as StudioConfig) };
  } catch {
    return DEFAULT_STUDIO_CONFIG;
  }
}

/**
 * Opsi picker studio (tanpa secret): provider+model+style+subjek+aspek aktif.
 * Auto = null (waterfall prioritas / default config).
 * Plus opsi LLM (llm_* aktif) untuk tombol enhance prompt.
 */
export async function listStudioOptions(): Promise<StudioOptions> {
  await requireUser();
  const supabase = svc();
  const config = await getStudioConfig();
  const [{ data: providers }, { data: models }, { data: styles }, { data: subjects }, { data: cameras }, { data: aspects }, { data: llmProviders }, { data: llmModels }] =
    await Promise.all([
      supabase.from('image_providers').select('id, slug, display_name').eq('is_active', true).order('priority'),
      supabase
        .from('image_models')
        .select('id, provider_id, model_id, display_name, config, image_providers!inner(slug)')
        .eq('is_active', true)
        .order('priority'),
      supabase.from('image_style_presets').select('slug, display_name').eq('is_active', true).order('slug'),
      supabase
        .from('image_subject_templates')
        .select('slug, display_name')
        .eq('is_active', true)
        .order('sort_order')
        .order('slug'),
      supabase
        .from('image_camera_angles')
        .select('slug, display_name')
        .eq('is_active', true)
        .order('sort_order')
        .order('slug'),
      supabase.from('image_aspect_ratios').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('llm_providers').select('id, slug, display_name').eq('is_active', true).order('priority'),
      supabase.from('llm_models').select('id, provider_id, model_id, display_name').eq('is_active', true).order('priority')
    ]);
  const mappedModels = ((models ?? []) as unknown as Array<{
    id: string;
    provider_id: string;
    model_id: string;
    display_name: string;
    config: Record<string, unknown> | null;
    image_providers: { slug: string };
  }>).map(({ image_providers, ...m }) => ({
    ...m,
    provider_slug: image_providers.slug,
    supports_reference: modelSupportsReference({ model_id: m.model_id, config: m.config }),
    text_capable: m.config?.['text_capable'] === true
  }));
  return {
    providers: (providers ?? []) as StudioOptions['providers'],
    models: mappedModels,
    styles: (styles ?? []) as StudioOptions['styles'],
    subjects: (subjects ?? []) as StudioOptions['subjects'],
    cameras: (cameras ?? []) as StudioOptions['cameras'],
    aspects: (aspects ?? []) as StudioOptions['aspects'],
    config,
    llmProviders: (llmProviders ?? []) as StudioOptions['llmProviders'],
    llmModels: (llmModels ?? []) as StudioOptions['llmModels']
  };
}

export interface EnqueueStudioInput {
  prompt: string;
  negativePrompt?: string | null;
  providerId?: string | null;
  modelId?: string | null;
  styleSlug?: string | null;
  subjectSlug?: string | null;
  cameraSlug?: string | null;
  aspectSlug: string;
  /** Kekuatan img2img 0–1 (hanya bermakna bila referensi diisi). */
  referenceStrength?: number | null;
  /** Public URL referensi: hasil upload baru atau public_url histori milik user. */
  referencePublicUrl?: string | null;
  /** Path storage referensi bila sudah di-upload (hemat re-upload). */
  referenceStoragePath?: string | null;
  /** Advanced opsional (form <details>): NULL = Auto/default model. */
  guidance?: number | null;
  steps?: number | null;
  seed?: number | null;
  reqWidth?: number | null;
  reqHeight?: number | null;
}

/** Batas upload referensi img2img dipakai form dari `@/lib/image/types`. */

/**
 * Upload file referensi img2img milik user → Storage `user-images/ref/`.
 * Validasi: login, mime JPEG/PNG/WebP, size ≤5MB. Tidak memotong kuota
 * generate (upload ≠ generate).
 */
export async function uploadStudioReference(
  formData: FormData
): Promise<StudioActionResult<{ storagePath: string; publicUrl: string }>> {
  try {
    const { id: userId } = await requireUser();
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
    return { ok: true, data: await uploadUserReference(userId, refId, bytes, file.type) };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Enqueue generate studio (tidak blocking — worker cron proses ≤5 menit).
 * Validasi: panjang prompt ikut config, FK harus aktif, kuota harian.
 */
export async function enqueueStudioImage(
  input: EnqueueStudioInput
): Promise<StudioActionResult<{ imageId: string; expiresAt: string }>> {
  try {
    return { ok: true, data: await enqueueStudioImageImpl(input) };
  } catch (e) {
    return fail(e);
  }
}

async function enqueueStudioImageImpl(input: EnqueueStudioInput): Promise<{ imageId: string; expiresAt: string }> {
  const { id: userId } = await requireUser();
  const supabase = svc();
  const config = await getStudioConfig();

  const parsed = studioInputSchema(config.max_prompt_length).safeParse({
    prompt: input.prompt,
    negativePrompt: input.negativePrompt ?? '',
    providerId: input.providerId ?? null,
    modelId: input.modelId ?? null,
    styleSlug: input.styleSlug ?? null,
    subjectSlug: input.subjectSlug ?? null,
    cameraSlug: input.cameraSlug ?? null,
    aspectSlug: input.aspectSlug,
    referenceStrength: input.referenceStrength ?? null,
    referencePublicUrl: input.referencePublicUrl ?? null,
    guidance: input.guidance ?? null,
    steps: input.steps ?? null,
    seed: input.seed ?? null,
    reqWidth: input.reqWidth ?? null,
    reqHeight: input.reqHeight ?? null
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Input tidak valid.');
  }
  const v = parsed.data;

  // Validasi FK aktif (sekali jalan, tanpa secret).
  const [{ data: provs }, { data: mods }, { data: aspects }] = await Promise.all([
    supabase.from('image_providers').select('id').eq('is_active', true),
    supabase.from('image_models').select('id, provider_id, model_id, config').eq('is_active', true),
    supabase.from('image_aspect_ratios').select('slug').eq('is_active', true)
  ]);
  const providerIds = new Set(((provs ?? []) as { id: string }[]).map((p) => p.id));
  const modelRows = (mods ?? []) as { id: string; provider_id: string; model_id: string; config: Record<string, unknown> | null }[];
  const aspectSlugs = new Set(((aspects ?? []) as { slug: string }[]).map((a) => a.slug));
  if (v.providerId && !providerIds.has(v.providerId)) throw new Error('Provider tidak aktif — refresh pilihan.');
  if (v.modelId && !modelRows.some((m) => m.id === v.modelId)) throw new Error('Model tidak aktif — refresh pilihan.');
  const linkErr = validateProviderModelLink(v.providerId, v.modelId, modelRows);
  if (linkErr) throw new Error(linkErr);
  const refModels = modelRows.map((m) => ({
    id: m.id,
    supports_reference: modelSupportsReference({ model_id: m.model_id, config: m.config }),
    display_name: m.model_id
  }));
  const refLinkErr = validateReferenceModelLink(v.referencePublicUrl, v.modelId, refModels);
  if (refLinkErr) throw new Error(refLinkErr);
  if (!aspectSlugs.has(v.aspectSlug)) throw new Error('Aspek rasio tidak aktif — refresh pilihan.');
  if (v.styleSlug) {
    const { data: st } = await supabase.from('image_style_presets').select('slug').eq('slug', v.styleSlug).eq('is_active', true).maybeSingle();
    if (!st) throw new Error('Preset style tidak aktif — refresh pilihan.');
  }
  if (v.subjectSlug) {
    const { data: sj } = await supabase.from('image_subject_templates').select('slug').eq('slug', v.subjectSlug).eq('is_active', true).maybeSingle();
    if (!sj) throw new Error('Template subjek tidak aktif — refresh pilihan.');
  }
  if (v.cameraSlug) {
    const { data: ca } = await supabase.from('image_camera_angles').select('slug').eq('slug', v.cameraSlug).eq('is_active', true).maybeSingle();
    if (!ca) throw new Error('Camera angle tidak aktif — refresh pilihan.');
  }

  // Referensi img2img: pastikan URL berasal dari histori milik user sendiri
  // (public_url hasil generate sendiri) ATAU upload-baru milik sendiri
  // (`ref/{userId}/` yang file-nya benar ada di Storage) — cegah tempel
  // URL asing yang lolos validasi client.
  let referenceStoragePath: string | null = input.referenceStoragePath?.trim() || null;
  if (v.referencePublicUrl) {
    const { data: owned } = await supabase
      .from('user_image_generations')
      .select('reference_storage_path, storage_path')
      .eq('user_id', userId)
      .or(`public_url.eq.${v.referencePublicUrl},reference_public_url.eq.${v.referencePublicUrl}`)
      .limit(1)
      .maybeSingle();
    const own = owned as { reference_storage_path: string | null; storage_path: string | null } | null;
    if (own) {
      if (!referenceStoragePath) {
        referenceStoragePath = own.reference_storage_path ?? own.storage_path ?? null;
      }
    } else {
      // Bukan dari histori → verifikasi upload-baru: URL harus milik
      // `ref/{userId}/` sendiri dan file-nya ada (kasus prod 12 Sep 2026:
      // upload baru selalu ditolak karena tak ada baris histori yang cocok).
      const derived = resolveFreshReferenceStoragePath({
        userId,
        publicUrl: v.referencePublicUrl,
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
      });
      if (!derived) throw new Error('Referensi harus dari upload atau histori milik Anda.');
      await assertFreshReferenceExists(supabase, derived);
      referenceStoragePath = derived;
    }
  }

  // Kuota harian per user (configurable; null = unlimited).
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const { count } = await supabase
    .from('user_image_generations')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', dayStart.toISOString());
  const used = count ?? 0;
  const { allowed } = checkStudioQuota(used, config.daily_limit);
  if (!allowed) throw new Error(quotaExceededMessage(config.daily_limit ?? 0));

  const expiresAt = buildStudioExpiry(new Date(), config.retention_days);
  const strength = v.referencePublicUrl ? clampImg2ImgStrength(v.referenceStrength) : null;
  const { data: created, error } = await supabase
    .from('user_image_generations')
    .insert({
      user_id: userId,
      image_prompt: v.prompt,
      negative_prompt: v.negativePrompt || null,
      provider_id: v.providerId,
      model_id: v.modelId,
      style_slug: v.styleSlug,
      subject_slug: v.subjectSlug,
      camera_slug: v.cameraSlug,
      aspect_slug: v.aspectSlug,
      reference_public_url: v.referencePublicUrl,
      reference_storage_path: referenceStoragePath,
      reference_strength: strength,
      guidance: v.guidance,
      steps: v.steps,
      seed: v.seed,
      req_width: v.reqWidth,
      req_height: v.reqHeight,
      expires_at: expiresAt
    })
    .select('id, expires_at')
    .single();
  if (error || !created) throw new Error(error?.message ?? 'Gagal masuk antrean — coba lagi.');
  revalidatePath('/studio');
  return { imageId: (created as { id: string }).id, expiresAt: (created as { expires_at: string }).expires_at };
}

/**
 * Histori milik user (default terbaru dulu). Baris expired disembunyikan.
 * Filter per parameter enqueue + sort tanggal (semua kolom sudah ada di tabel).
 */
export async function listUserImages(options?: StudioListOptions): Promise<StudioGenerationRow[]> {
  const { id: userId } = await requireUser();
  const supabase = svc();
  const limit = Math.min(100, Math.max(1, options?.limit ?? 20));
  const sortBy = options?.sortBy === 'updated_at' ? 'updated_at' : 'created_at';
  const ascending = options?.dir === 'asc';
  let q = supabase
    .from('user_image_generations')
    .select('*')
    .eq('user_id', userId)
    .gte('expires_at', new Date().toISOString())
    .order(sortBy, { ascending })
    .limit(limit);
  if (options?.status && options.status !== 'all') q = q.eq('status', options.status);
  if (options?.providerId) q = q.eq('provider_id', options.providerId);
  if (options?.modelId) q = q.eq('model_id', options.modelId);
  if (options?.styleSlug) q = q.eq('style_slug', options.styleSlug);
  if (options?.subjectSlug) q = q.eq('subject_slug', options.subjectSlug);
  if (options?.cameraSlug) q = q.eq('camera_slug', options.cameraSlug);
  if (options?.aspectSlug) q = q.eq('aspect_slug', options.aspectSlug);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as StudioGenerationRow[];
}

export interface EnhanceStudioInput {
  prompt: string;
  negativePrompt?: string | null;
  styleSlug?: string | null;
  subjectSlug?: string | null;
  cameraSlug?: string | null;
  /** Pin model LLM (UUID llm_models.id). Null = Auto = stage default enhance. */
  llmModelId?: string | null;
}

/**
 * Enhance (polish) prompt di form Studio — side-by-side Terima/Batal.
 * Tanpa konteks postingan (Studio prompt bebas): style suffix hanya hint,
 * gate self-consistency (panjang + strategi valid).
 * Stage: enhance_image_prompt; rate limit 30/jam TERPISAH dari kuota
 * generate harian agar eksplorasi prompt tidak memotong kuota.
 *
 * Field-aware (16 Sep 2026): pilihan Preset style / Template subjek /
 * Camera angle dikirim sebagai konteks; LLM memilihkan slug untuk field yang
 * masih Auto. Slug hasil LLM divalidasi ke himpunan aktif (anti-halusinasi).
 */
export async function enhanceStudioPrompt(
  input: EnhanceStudioInput
): Promise<StudioActionResult<StudioEnhanceResult>> {
  try {
    return { ok: true, data: await enhanceStudioPromptImpl(input) };
  } catch (e) {
    return fail(e);
  }
}

async function enhanceStudioPromptImpl(input: EnhanceStudioInput): Promise<StudioEnhanceResult> {
  await requireUser();
  const config = await getStudioConfig();
  const maxPrompt = config.max_prompt_length;

  const draftPrompt = input.prompt?.trim() ?? '';
  if (!draftPrompt || draftPrompt.length < 10) throw new Error('Prompt minimal 10 karakter (isi dulu di textarea).');
  if (draftPrompt.length > maxPrompt) throw new Error(`Prompt maksimal ${maxPrompt} karakter.`);
  const negDraft = input.negativePrompt?.trim().slice(0, 300) ?? null;
  const supabase = svc();

  // Validasi pin LLM aktif (sekali jalan, tanpa secret).
  if (input.llmModelId) {
    const { data: lm } = await supabase
      .from('llm_models')
      .select('id')
      .eq('id', input.llmModelId)
      .eq('is_active', true)
      .maybeSingle();
    if (!lm) throw new Error('Model LLM tidak aktif — refresh pilihan.');
  }

  // Opsi picker aktif (slug + display_name) + teks EN/style suffix baris
  // terpilih — satu Promise.all, tanpa secret.
  const [{ data: styleRows }, { data: subjectRows }, { data: cameraRows }] = await Promise.all([
    supabase
      .from('image_style_presets')
      .select('slug, display_name, prompt_suffix')
      .eq('is_active', true)
      .order('slug'),
    supabase
      .from('image_subject_templates')
      .select('slug, display_name, subject_en')
      .eq('is_active', true)
      .order('sort_order')
      .order('slug'),
    supabase
      .from('image_camera_angles')
      .select('slug, display_name, angle_en')
      .eq('is_active', true)
      .order('sort_order')
      .order('slug')
  ]);
  const styles = (styleRows ?? []) as { slug: string; display_name: string; prompt_suffix: string | null }[];
  const subjects = (subjectRows ?? []) as { slug: string; display_name: string; subject_en: string | null }[];
  const cameras = (cameraRows ?? []) as { slug: string; display_name: string; angle_en: string | null }[];

  const pickedStyle = input.styleSlug ? styles.find((s) => s.slug === input.styleSlug) ?? null : null;
  const pickedSubject = input.subjectSlug ? subjects.find((s) => s.slug === input.subjectSlug) ?? null : null;
  const pickedCamera = input.cameraSlug ? cameras.find((c) => c.slug === input.cameraSlug) ?? null : null;

  // Rate limit 30/jam (bucket sendiri: enhance_studio_prompt).
  const hdrs = await headers();
  const ip = getClientIp(hdrs);
  const { allowed, count } = await consumeRateLimit(ip, 'enhance_studio_prompt', 30);
  if (!allowed) throw new Error(`rate_limit:${count} — enhance 30/jam`);

  const { system, user } = buildStudioEnhanceMessages({
    promptDraft: draftPrompt.slice(0, maxPrompt),
    negativeDraft: negDraft,
    styleSuffix: pickedStyle?.prompt_suffix?.trim() || undefined,
    styleName: pickedStyle?.display_name ?? null,
    subjectName: pickedSubject?.display_name ?? null,
    subjectEn: pickedSubject?.subject_en?.trim() ?? null,
    cameraName: pickedCamera?.display_name ?? null,
    cameraEn: pickedCamera?.angle_en?.trim() ?? null,
    styleOptions: styles.map(({ slug, display_name }) => ({ slug, display_name })),
    subjectOptions: subjects.map(({ slug, display_name }) => ({ slug, display_name })),
    cameraOptions: cameras.map(({ slug, display_name }) => ({ slug, display_name }))
  });

  const { providerId, modelUuid } = await resolveStageModel('enhance_image_prompt', input.llmModelId ?? null);
  const llm = getServiceClient();

  async function attempt(temperature: number, gateNote?: string) {
    const msgs = [
      { role: 'system' as const, content: system },
      { role: 'user' as const, content: gateNote ? `${user}\n\nPENTING: output sebelumnya gagal gate (${gateNote}). Perbaiki visual_strategy + image_prompt + negative_prompt (negative WAJIB terisi).` : user }
    ];
    const out = await runLLMCompletion(llm, {
      stage: 'enhance_image_prompt',
      providerId,
      modelUuid,
      messages: msgs,
      temperature,
      maxTokens: 1000
    });
    return { parsed: parseImagePrompt(out.output.text) };
  }

  // Gate konsisten dengan worker konten + negative WAJIB untuk enhance Studio.
  const gateWith = (parsed: ReturnType<typeof parseImagePrompt>) =>
    validateImagePromptContradiction(
      { image_prompt: parsed.image_prompt, negative_prompt: parsed.negative_prompt, reasoning: parsed.reasoning },
      draftPrompt,
      { requireNegative: true }
    );

  let chosen = await attempt(0.5);
  const gate = gateWith(chosen.parsed);
  if (!gate.ok) {
    const retry = await attempt(0.3, gate.reasons.join('; '));
    const gate2 = gateWith(retry.parsed);
    if (!gate2.ok) throw new Error(`enhance gate: ${[...gate.reasons, ...gate2.reasons].join(' | ').slice(0, 500)}`);
    chosen = retry;
  }

  // Anti-halusinasi: slug di luar himpunan aktif → null (biarkan Auto),
  // bukan menggagalkan seluruh enhance.
  const activeSlugs = (rows: { slug: string }[], slug: string | null | undefined) =>
    slug && rows.some((r) => r.slug === slug) ? slug : null;
  const parsed = chosen.parsed;

  return {
    image_prompt: parsed.image_prompt,
    negative_prompt: parsed.negative_prompt ?? '',
    reasoning: parsed.reasoning,
    style_slug: activeSlugs(styles, parsed.style_slug),
    subject_slug: activeSlugs(subjects, parsed.subject_slug),
    camera_slug: activeSlugs(cameras, parsed.camera_slug)
  };
}

/** Detail 1 hasil milik user (untuk polling status). */
export async function getStudioImage(imageId: string): Promise<StudioGenerationRow> {
  const { id: userId } = await requireUser();
  if (!imageId) throw new Error('imageId wajib diisi.');
  const { data } = await svc()
    .from('user_image_generations')
    .select('*')
    .eq('id', imageId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!data) throw new Error('Hasil tidak ditemukan (mungkin sudah kedaluwarsa).');
  return data as unknown as StudioGenerationRow;
}

/** Ulangi hasil failed milik user (kembali ke antrean). */
export async function retryFailedStudioImage(
  imageId: string
): Promise<StudioActionResult<{ imageId: string }>> {
  try {
    return { ok: true, data: await retryFailedStudioImageImpl(imageId) };
  } catch (e) {
    return fail(e);
  }
}

async function retryFailedStudioImageImpl(imageId: string): Promise<{ imageId: string }> {
  const { id: userId } = await requireUser();
  if (!imageId) throw new Error('imageId wajib diisi.');
  const supabase = svc();
  const { data: row } = await supabase
    .from('user_image_generations')
    .select('id, status')
    .eq('id', imageId)
    .eq('user_id', userId)
    .maybeSingle();
  const r = row as { id: string; status: string } | null;
  if (!r) throw new Error('Hasil tidak ditemukan.');
  if (r.status !== 'failed') throw new Error('Hanya hasil failed yang bisa diulang.');
  const { error } = await supabase
    .from('user_image_generations')
    .update({ status: 'pending', attempts: 0, last_error: null, updated_at: new Date().toISOString() })
    .eq('id', imageId)
    .eq('status', 'failed');
  if (error) throw new Error(error.message);
  revalidatePath('/studio');
  return { imageId };
}

/** Hapus histori milik user (row + file Storage atomik via service_role). */
export async function deleteStudioImage(imageId: string): Promise<StudioActionResult> {
  try {
    await deleteStudioImageImpl(imageId);
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

async function deleteStudioImageImpl(imageId: string): Promise<void> {
  const { id: userId } = await requireUser();
  if (!imageId) throw new Error('imageId wajib diisi.');
  const supabase = svc();
  const { data: row } = await supabase
    .from('user_image_generations')
    .select('id, storage_path')
    .eq('id', imageId)
    .eq('user_id', userId)
    .maybeSingle();
  const r = row as { id: string; storage_path: string | null } | null;
  if (!r) throw new Error('Hasil tidak ditemukan.');
  if (r.storage_path) {
    await removeUserImage(r.storage_path).catch(() => {});
  }
  const { error } = await supabase.from('user_image_generations').delete().eq('id', imageId).eq('user_id', userId);
  if (error) throw new Error(error.message);
  revalidatePath('/studio');
}

/** Sisa kuota hari ini (untuk badge di UI). */
export async function getStudioQuota(): Promise<StudioQuota> {
  const { id: userId } = await requireUser();
  const config = await getStudioConfig();
  if (config.daily_limit === null) return { used: 0, limit: null, remaining: null };
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const { count } = await svc()
    .from('user_image_generations')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', dayStart.toISOString());
  const used = count ?? 0;
  return { used, limit: config.daily_limit, remaining: Math.max(0, (config.daily_limit ?? 0) - used) };
}

// ── Batch generate image (/studio/batch) ───────────────────────────────
// V1: setting shared untuk seluruh batch; override per-prompt TIDAK
// didukung (lihat TODO di types.ts). img2img juga TIDAK didukung batch V1.
// Worker antrean FIFO yang sama dengan single tidak diubah: baris anak
// `user_image_generations{status:'pending', batch_id}` diproses satu-per-satu.

export interface EnqueueBatchInput {
  /** Prompt sudah ter-split double-newline (caller: `parseBatchPrompts`). */
  prompts: string[];
  /** Nama batch opsional (max 120 char). */
  batchName?: string | null;
  /** Setting shared untuk seluruh prompt (schema sama dengan EnqueueStudioInput minus reference). */
  negativePrompt?: string | null;
  providerId?: string | null;
  modelId?: string | null;
  styleSlug?: string | null;
  subjectSlug?: string | null;
  cameraSlug?: string | null;
  aspectSlug: string;
  guidance?: number | null;
  steps?: number | null;
  seed?: number | null;
  reqWidth?: number | null;
  reqHeight?: number | null;
}

/** Clamp knob `max_batch_prompts` config: angka floor 1–50, bukan-angka → fallback. */
function clampMaxBatch(raw: unknown, fallback = 50): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(50, Math.max(1, n));
}

/**
 * Enqueue satu batch prompt sekaligus (shared setting untuk semua prompt).
 * Tolak PENUH bila ada blok tak valid, N > cap, atau `usedToday + N > daily_limit`
 * — tidak pernah partial-enqueue agar user tahu persis mana yang ditolak.
 *
 * Flow: requireUser → config live → `validateBatchPrompts` per-blok + cap
 * → FK aktif (provider/model/aspect/style/subjek/camera) →
 * `checkStudioQuotaForBatch(used, limit, N)` (N kali slot) →
 * insert `studio_batches` (parent) → loop insert `user_image_generations`
 * anak (`batch_id` di-set) → revalidate `/studio/batch` + `/studio`.
 * Semua error sebagai `ok:false` (pola `StudioActionResult`), bukan throw.
 */
export async function enqueueStudioBatch(input: EnqueueBatchInput): Promise<StudioActionResult<{ batchId: string; enqueued: number }>> {
  try {
    return { ok: true, data: await enqueueStudioBatchImpl(input) };
  } catch (e) {
    return fail(e);
  }
}

async function enqueueStudioBatchImpl(input: EnqueueBatchInput): Promise<{ batchId: string; enqueued: number }> {
  const { id: userId } = await requireUser();
  const supabase = svc();
  const config = await getStudioConfig();

  const maxBatch = clampMaxBatch(config.max_batch_prompts);
  const { valid, rejected, batchRejected } = validateBatchPrompts(input.prompts, config.max_prompt_length, maxBatch);
  if (rejected.length > 0 || batchRejected) {
    const n = rejected.length;
    const detail = batchRejected ?? `${rejected[0]!.index} prompt tidak valid (${rejected[0]!.reason}).`;
    throw new Error(`Batch ditolak: ${n > 0 ? `${n} prompt tidak valid — ` : ''}${detail}`);
  }

  // Validasi FK aktif (sekali jalan, tanpa secret) — pola single `enqueueStudioImageImpl`.
  const [{ data: provs }, { data: mods }, { data: aspects }] = await Promise.all([
    supabase.from('image_providers').select('id').eq('is_active', true),
    supabase.from('image_models').select('id, provider_id, model_id, config').eq('is_active', true),
    supabase.from('image_aspect_ratios').select('slug').eq('is_active', true)
  ]);
  const providerIds = new Set(((provs ?? []) as { id: string }[]).map((p) => p.id));
  const modelRows = (mods ?? []) as { id: string; provider_id: string; model_id: string; config: Record<string, unknown> | null }[];
  const aspectSlugs = new Set(((aspects ?? []) as { slug: string }[]).map((a) => a.slug));
  if (input.providerId && !providerIds.has(input.providerId)) throw new Error('Provider tidak aktif — refresh pilihan.');
  if (input.modelId && !modelRows.some((m) => m.id === input.modelId)) throw new Error('Model tidak aktif — refresh pilihan.');
  const linkErr = validateProviderModelLink(input.providerId ?? null, input.modelId ?? null, modelRows);
  if (linkErr) throw new Error(linkErr);
  if (!aspectSlugs.has(input.aspectSlug)) throw new Error('Aspek rasio tidak aktif — refresh pilihan.');
  if (input.styleSlug) {
    const { data: st } = await supabase.from('image_style_presets').select('slug').eq('slug', input.styleSlug).eq('is_active', true).maybeSingle();
    if (!st) throw new Error('Preset style tidak aktif — refresh pilihan.');
  }
  if (input.subjectSlug) {
    const { data: sj } = await supabase.from('image_subject_templates').select('slug').eq('slug', input.subjectSlug).eq('is_active', true).maybeSingle();
    if (!sj) throw new Error('Template subjek tidak aktif — refresh pilihan.');
  }
  if (input.cameraSlug) {
    const { data: ca } = await supabase.from('image_camera_angles').select('slug').eq('slug', input.cameraSlug).eq('is_active', true).maybeSingle();
    if (!ca) throw new Error('Camera angle tidak aktif — refresh pilihan.');
  }

  // Kuota harian: N slot sekaligus. Limit null = unlimited; `used + N <= limit`
  // atau tolak penuh (tidak ada partial-enqueue).
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const { count } = await supabase
    .from('user_image_generations')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', dayStart.toISOString());
  const used = count ?? 0;
  const quotaRes = checkStudioQuotaForBatch(used, config.daily_limit, valid.length);
  if (!quotaRes.allowed) {
    throw new Error(`Kuota kurang: butuh ${valid.length}, sisa ${quotaRes.remaining ?? 0} dari limit ${config.daily_limit}/hari.`);
  }

  const expiresAt = buildStudioExpiry(new Date(), config.retention_days);
  const settings = {
    negativePrompt: input.negativePrompt?.trim() || null,
    providerId: input.providerId ?? null,
    modelId: input.modelId ?? null,
    styleSlug: input.styleSlug ?? null,
    subjectSlug: input.subjectSlug ?? null,
    cameraSlug: input.cameraSlug ?? null,
    aspectSlug: input.aspectSlug,
    guidance: input.guidance ?? null,
    steps: input.steps ?? null,
    seed: input.seed ?? null,
    reqWidth: input.reqWidth ?? null,
    reqHeight: input.reqHeight ?? null
  };
  const { data: createdBatch, error: batchErr } = await supabase
    .from('studio_batches')
    .insert({
      user_id: userId,
      name: input.batchName?.trim().slice(0, 120) || null,
      settings,
      total: valid.length
    })
    .select('id')
    .single();
  if (batchErr || !createdBatch) throw new Error(batchErr?.message ?? 'Gagal buat batch — coba lagi.');
  const batchId = (createdBatch as { id: string }).id;

  // Insert anak satu-per-satu agar `batch_id` tercatat; worker cron memproses
  // antrean FIFO seperti baris single.
  let inserted = 0;
  for (const prompt of valid) {
    const { data: child, error: childErr } = await supabase
      .from('user_image_generations')
      .insert({
        user_id: userId,
        image_prompt: prompt,
        negative_prompt: settings.negativePrompt,
        provider_id: settings.providerId,
        model_id: settings.modelId,
        style_slug: settings.styleSlug,
        subject_slug: settings.subjectSlug,
        camera_slug: settings.cameraSlug,
        aspect_slug: input.aspectSlug,
        batch_id: batchId,
        guidance: settings.guidance,
        steps: settings.steps,
        seed: settings.seed,
        req_width: settings.reqWidth,
        req_height: settings.reqHeight,
        expires_at: expiresAt
      })
      .select('id');
    if (childErr) throw new Error(childErr.message ?? 'Gagal enqueue anak batch — coba lagi.');
    inserted += 1;
  }
  revalidatePath('/studio/batch');
  revalidatePath('/studio');
  return { batchId, enqueued: inserted };
}

/** Daftar batch milik user (terbaru dulu, limit clamp 1–50 default 20). */
export async function listStudioBatches(limit = 20): Promise<StudioBatchWithCounts[]> {
  const { id: userId } = await requireUser();
  const supabase = svc();
  const clamped = Math.min(50, Math.max(1, limit));
  const { data } = await supabase
    .from('studio_batches')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(clamped);
  const rows = (data ?? []) as unknown as Omit<StudioBatchWithCounts, 'pending' | 'ready' | 'failed'>[];
  // N+1 diterima untuk V1 (cap 50); per-batch query status anak.
  const result: StudioBatchWithCounts[] = [];
  for (const b of rows) {
    const { data: children } = await supabase
      .from('user_image_generations')
      .select('status')
      .eq('batch_id', b.id);
    let pending = 0;
    let ready = 0;
    let failed = 0;
    for (const c of ((children ?? []) as { status: string }[])) {
      if (c.status === 'pending') pending += 1;
      else if (c.status === 'ready') ready += 1;
      else if (c.status === 'failed') failed += 1;
    }
    result.push({ ...b, pending, ready, failed });
  }
  return result;
}

/** Baris anak milik satu batch milik user (urutan antrean = created ASC). */
export async function listBatchImages(batchId: string): Promise<StudioGenerationRow[]> {
  const { id: userId } = await requireUser();
  const supabase = svc();
  const { data: batch } = await supabase
    .from('studio_batches')
    .select('id')
    .eq('id', batchId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!batch) throw new Error('Batch tidak ditemukan (atau bukan milik Anda).');
  const { data, error } = await supabase
    .from('user_image_generations')
    .select('*')
    .eq('batch_id', batchId)
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as StudioGenerationRow[];
}

/** Ulangi anak failed dalam satu batch seketika (status pending, attempts reset). */
export async function retryFailedBatchImages(batchId: string): Promise<StudioActionResult<{ retried: number }>> {
  try {
    return { ok: true, data: await retryFailedBatchImagesImpl(batchId) };
  } catch (e) {
    return fail(e);
  }
}

async function retryFailedBatchImagesImpl(batchId: string): Promise<{ retried: number }> {
  const { id: userId } = await requireUser();
  const supabase = svc();
  const { data: batch } = await supabase
    .from('studio_batches')
    .select('id')
    .eq('id', batchId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!batch) throw new Error('Batch tidak ditemukan (atau bukan milik Anda).');
  const { data: failed } = await supabase
    .from('user_image_generations')
    .select('id')
    .eq('batch_id', batchId)
    .eq('status', 'failed');
  const retried = (failed ?? []).length;
  if (retried > 0) {
    const { error } = await supabase
      .from('user_image_generations')
      .update({ status: 'pending', attempts: 0, last_error: null, updated_at: new Date().toISOString() })
      .eq('batch_id', batchId)
      .eq('status', 'failed');
    if (error) throw new Error(error.message);
  }
  revalidatePath('/studio/batch');
  revalidatePath('/studio');
  return { retried };
}

/** Hapus satu batch beserta anak & file Storage-nya (parent cascade-kan baris). */
export async function deleteStudioBatch(batchId: string): Promise<StudioActionResult> {
  try {
    await deleteStudioBatchImpl(batchId);
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

async function deleteStudioBatchImpl(batchId: string): Promise<void> {
  const { id: userId } = await requireUser();
  const supabase = svc();
  const { data: batch } = await supabase
    .from('studio_batches')
    .select('id')
    .eq('id', batchId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!batch) throw new Error('Batch tidak ditemukan (atau bukan milik Anda).');
  // Bersihkan file Storage anak (best-effort; baris DB ikut CASCADE saat parent dihapus).
  const { data: children } = await supabase
    .from('user_image_generations')
    .select('storage_path')
    .eq('batch_id', batchId);
  for (const c of ((children ?? []) as { storage_path: string | null }[])) {
    if (c.storage_path) await removeUserImage(c.storage_path).catch(() => {});
  }
  const { error } = await supabase.from('studio_batches').delete().eq('id', batchId).eq('user_id', userId);
  if (error) throw new Error(error.message);
  revalidatePath('/studio/batch');
  revalidatePath('/studio');
}
