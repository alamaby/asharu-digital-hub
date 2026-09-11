'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/require-user';
import { createSupabaseService } from '@/lib/supabase/server';
import { DEFAULT_STUDIO_CONFIG, type StudioConfig, type StudioGenerationRow, type StudioOptions, type StudioQuota } from './types';
import { buildStudioExpiry, checkStudioQuota, quotaExceededMessage, studioInputSchema, validateProviderModelLink } from './validation';
import { removeUserImage } from './storage';

function svc() {
  const supabase = createSupabaseService();
  if (!supabase) throw new Error('Supabase belum dikonfigurasi.');
  return supabase;
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
 */
export async function listStudioOptions(): Promise<StudioOptions> {
  await requireUser();
  const supabase = svc();
  const config = await getStudioConfig();
  const [{ data: providers }, { data: models }, { data: styles }, { data: subjects }, { data: aspects }] =
    await Promise.all([
      supabase.from('image_providers').select('id, slug, display_name').eq('is_active', true).order('priority'),
      supabase
        .from('image_models')
        .select('id, provider_id, model_id, display_name, image_providers!inner(slug)')
        .eq('is_active', true)
        .order('priority'),
      supabase.from('image_style_presets').select('slug, display_name').eq('is_active', true).order('slug'),
      supabase
        .from('image_subject_templates')
        .select('slug, display_name')
        .eq('is_active', true)
        .order('sort_order')
        .order('slug'),
      supabase.from('image_aspect_ratios').select('*').eq('is_active', true).order('sort_order')
    ]);
  const mappedModels = ((models ?? []) as unknown as Array<{
    id: string;
    provider_id: string;
    model_id: string;
    display_name: string;
    image_providers: { slug: string };
  }>).map(({ image_providers, ...m }) => ({ ...m, provider_slug: image_providers.slug }));
  return {
    providers: (providers ?? []) as StudioOptions['providers'],
    models: mappedModels,
    styles: (styles ?? []) as StudioOptions['styles'],
    subjects: (subjects ?? []) as StudioOptions['subjects'],
    aspects: (aspects ?? []) as StudioOptions['aspects'],
    config
  };
}

export interface EnqueueStudioInput {
  prompt: string;
  negativePrompt?: string | null;
  providerId?: string | null;
  modelId?: string | null;
  styleSlug?: string | null;
  subjectSlug?: string | null;
  aspectSlug: string;
}

/**
 * Enqueue generate studio (tidak blocking — worker cron proses ≤5 menit).
 * Validasi: panjang prompt ikut config, FK harus aktif, kuota harian.
 */
export async function enqueueStudioImage(input: EnqueueStudioInput): Promise<{ imageId: string; expiresAt: string }> {
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
    aspectSlug: input.aspectSlug
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Input tidak valid.');
  }
  const v = parsed.data;

  // Validasi FK aktif (sekali jalan, tanpa secret).
  const [{ data: provs }, { data: mods }, { data: aspects }] = await Promise.all([
    supabase.from('image_providers').select('id').eq('is_active', true),
    supabase.from('image_models').select('id, provider_id').eq('is_active', true),
    supabase.from('image_aspect_ratios').select('slug').eq('is_active', true)
  ]);
  const providerIds = new Set(((provs ?? []) as { id: string }[]).map((p) => p.id));
  const modelRows = (mods ?? []) as { id: string; provider_id: string }[];
  const aspectSlugs = new Set(((aspects ?? []) as { slug: string }[]).map((a) => a.slug));
  if (v.providerId && !providerIds.has(v.providerId)) throw new Error('Provider tidak aktif — refresh pilihan.');
  if (v.modelId && !modelRows.some((m) => m.id === v.modelId)) throw new Error('Model tidak aktif — refresh pilihan.');
  const linkErr = validateProviderModelLink(v.providerId, v.modelId, modelRows);
  if (linkErr) throw new Error(linkErr);
  if (!aspectSlugs.has(v.aspectSlug)) throw new Error('Aspek rasio tidak aktif — refresh pilihan.');
  if (v.styleSlug) {
    const { data: st } = await supabase.from('image_style_presets').select('slug').eq('slug', v.styleSlug).eq('is_active', true).maybeSingle();
    if (!st) throw new Error('Preset style tidak aktif — refresh pilihan.');
  }
  if (v.subjectSlug) {
    const { data: sj } = await supabase.from('image_subject_templates').select('slug').eq('slug', v.subjectSlug).eq('is_active', true).maybeSingle();
    if (!sj) throw new Error('Template subjek tidak aktif — refresh pilihan.');
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
      aspect_slug: v.aspectSlug,
      expires_at: expiresAt
    })
    .select('id, expires_at')
    .single();
  if (error || !created) throw new Error(error?.message ?? 'Gagal masuk antrean — coba lagi.');
  revalidatePath('/studio');
  return { imageId: (created as { id: string }).id, expiresAt: (created as { expires_at: string }).expires_at };
}

/** Histori milik user (terbaru dulu, default 20). Baris expired disembunyikan. */
export async function listUserImages(options?: { status?: 'pending' | 'ready' | 'failed' | 'all'; limit?: number }): Promise<StudioGenerationRow[]> {
  const { id: userId } = await requireUser();
  const supabase = svc();
  const limit = Math.min(100, Math.max(1, options?.limit ?? 20));
  let q = supabase
    .from('user_image_generations')
    .select('*')
    .eq('user_id', userId)
    .gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(limit);
  if (options?.status && options.status !== 'all') q = q.eq('status', options.status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as StudioGenerationRow[];
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
export async function retryFailedStudioImage(imageId: string): Promise<{ imageId: string }> {
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
export async function deleteStudioImage(imageId: string): Promise<void> {
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
