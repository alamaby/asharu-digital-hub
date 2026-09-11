import 'server-only';
import { getServiceClient } from '@/lib/supabase/service';
import { ImageKeyPool } from '@/lib/image/key-pool';
import { createImageAdapter } from '@/lib/image/providers';
import { markImageModelFailure, markImageModelUsage } from '@/lib/image/config';
import { mergeImageNegativePrompts } from '@/lib/image/prompt';
import { fetchRemoteImage } from '@/lib/image/storage';
import { ImageHttpError, type ImageAspect, type ImageModelRow, type ImageProviderRow, type ImageStylePreset } from '@/lib/image/types';
import type { StudioConfig, StudioGenerationRow } from '@/lib/studio/types';
import { DEFAULT_STUDIO_CONFIG } from '@/lib/studio/types';
import { uploadUserImage, removeUserImage } from '@/lib/studio/storage';

const MAX_ATTEMPTS = 3;

interface StudioTarget {
  provider: ImageProviderRow;
  model: ImageModelRow;
  style: ImageStylePreset | null;
  aspect: ImageAspect;
  /** True bila target berasal dari pin manual user (provider_id/model_id) — gagal jujur, tanpa fallback. */
  pinned: boolean;
}

async function getStudioConfigRow(): Promise<StudioConfig> {
  const supabase = getServiceClient();
  const { data } = await supabase.from('image_studio_config').select('*').eq('id', 1).maybeSingle();
  if (!data) return DEFAULT_STUDIO_CONFIG;
  return { ...DEFAULT_STUDIO_CONFIG, ...(data as StudioConfig) };
}

async function findStudioModel(modelUuid: string): Promise<{ provider: ImageProviderRow; model: ImageModelRow } | null> {
  const supabase = getServiceClient();
  const { data: m } = await supabase
    .from('image_models')
    .select('*, image_providers!inner(*)')
    .eq('id', modelUuid)
    .eq('is_active', true)
    .maybeSingle();
  const row = m as (ImageModelRow & { image_providers: ImageProviderRow }) | null;
  if (!row || !row.image_providers?.is_active) return null;
  const { image_providers: provider, ...model } = row;
  return { provider, model: model as ImageModelRow };
}

async function findStudioStyle(slug: string | null | undefined): Promise<ImageStylePreset | null> {
  if (!slug) return null;
  const supabase = getServiceClient();
  const { data } = await supabase
    .from('image_style_presets')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();
  return (data as ImageStylePreset | null) ?? null;
}

async function resolveStudioTarget(row: StudioGenerationRow, config: StudioConfig): Promise<StudioTarget> {
  const style =
    (await findStudioStyle(row.style_slug)) ??
    (await findStudioStyle(config.default_style_slug)) ??
    null;

  const aspectRaw = [row.aspect_slug, config.default_aspect_slug].find(Boolean) ?? '1:1';
  const aspect = (['1:1', '16:9', '9:16', '4:3', '3:4'] as ImageAspect[]).includes(aspectRaw as ImageAspect)
    ? (aspectRaw as ImageAspect)
    : '1:1';

  // 1) Model pilihan user (validasi silang provider bila keduanya diisi).
  // Strict-fail: pin manual TIDAK boleh jatuh ke waterfall diam-diam —
  // bila model/provider nonaktif atau tidak cocok → throw jujur.
  if (row.model_id) {
    const found = await findStudioModel(row.model_id);
    if (!found) {
      throw new Error('Model pilihan tidak aktif — pilih ulang model lalu coba lagi.');
    }
    if (row.provider_id && found.provider.id !== row.provider_id) {
      throw new Error('Model bukan milik provider terpilih.');
    }
    return { provider: found.provider, model: found.model, style, aspect, pinned: true };
  }

  // 2) Provider pilihan user → model default provider itu (juga pin: gagal jujur).
  if (row.provider_id) {
    const supabase = getServiceClient();
    const { data: prov } = await supabase
      .from('image_providers')
      .select('*')
      .eq('id', row.provider_id)
      .eq('is_active', true)
      .maybeSingle();
    const provider = (prov as ImageProviderRow | null) ?? null;
    if (!provider) {
      throw new Error('Provider pilihan tidak aktif — pilih ulang provider lalu coba lagi.');
    }
    const { data: mods } = await supabase
      .from('image_models')
      .select('*')
      .eq('provider_id', provider.id)
      .eq('is_active', true)
      .order('priority');
    const rows = (mods ?? []) as unknown as ImageModelRow[];
    const pick = rows.find((m) => m.is_default) ?? rows[0];
    if (!pick) {
      throw new Error('Provider pilihan tidak punya model aktif — pilih provider lain lalu coba lagi.');
    }
    return { provider, model: pick, style, aspect, pinned: true };
  }

  // 3) Default config studio (fallback config — boleh waterfall-kan provider,
  //    tapi pin model bila diisi).
  if (config.default_model_id) {
    const found = await findStudioModel(config.default_model_id);
    if (found) return { provider: found.provider, model: found.model, style, aspect, pinned: true };
  }

  // 4) Waterfall prioritas.
  const supabase = getServiceClient();
  const { data: provs } = await supabase
    .from('image_providers')
    .select('*')
    .eq('is_active', true)
    .order('priority');
  for (const provider of ((provs ?? []) as unknown as ImageProviderRow[])) {
    const { data: mods } = await supabase
      .from('image_models')
      .select('*')
      .eq('provider_id', provider.id)
      .eq('is_active', true)
      .order('priority');
    const rows = (mods ?? []) as unknown as ImageModelRow[];
    const pick = rows.find((m) => m.is_default) ?? rows[0];
    if (pick) return { provider, model: pick, style, aspect, pinned: false };
  }
  throw new Error('Tidak ada provider/model image aktif.');
}

/** Klaim 1 baris studio pending (atomic via eq status) → attempts+1. */
export async function claimPendingStudioImage(): Promise<StudioGenerationRow | null> {
  const supabase = getServiceClient();
  const { data: pending } = await supabase
    .from('user_image_generations')
    .select('*')
    .eq('status', 'pending')
    .lt('attempts', MAX_ATTEMPTS)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  const row = (pending as StudioGenerationRow | null) ?? null;
  if (!row) return null;
  const { data: claimed } = await supabase
    .from('user_image_generations')
    .update({ attempts: row.attempts + 1, updated_at: new Date().toISOString() })
    .eq('id', row.id)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();
  return (claimed as StudioGenerationRow | null) ?? null;
}

async function failStudioImage(imageId: string, message: string): Promise<void> {
  const supabase = getServiceClient();
  await supabase
    .from('user_image_generations')
    .update({ status: 'failed', last_error: message.slice(0, 500), updated_at: new Date().toISOString() })
    .eq('id', imageId);
}

/**
 * Proses 1 generate studio: klaim → resolve target → waterfall provider →
 * upload Storage `user-images` → status ready. Gagal jujur → failed + last_error.
 */
export async function processOneStudioImage(): Promise<{ imageId: string | null; error?: string }> {
  const row = await claimPendingStudioImage();
  if (!row) return { imageId: null };
  const imageId = row.id;

  try {
    const config = await getStudioConfigRow();
    const target = await resolveStudioTarget(row, config);
    const prompt = row.image_prompt?.trim() || '';
    if (!prompt && !config.allow_empty_prompt) {
      await failStudioImage(imageId, 'Prompt kosong — isi prompt dulu (minimal 10 karakter).');
      return { imageId: null, error: 'empty prompt' };
    }
    const styleSuffix = target.style?.prompt_suffix?.trim() || '';
    // Urutan natural: [subject, prompt, angle, style]. Angle disisip sebelum
    // style suffix (instruksi render) agar framing terbaca sebagai scene.
    let composed = prompt;
    // Subject template: disisipkan di depan sebagai konteks visual (opsional).
    if (row.subject_slug) {
      const supabase = getServiceClient();
      const { data: tpl } = await supabase
        .from('image_subject_templates')
        .select('subject_en')
        .eq('slug', row.subject_slug)
        .eq('is_active', true)
        .maybeSingle();
      const subjectEn = (tpl as { subject_en?: string } | null)?.subject_en?.trim();
      if (subjectEn) composed = `${subjectEn}, ${composed}`;
    }
    // Camera angle: auto-append natural di belakang prompt (opsional).
    const angleSlug = row.camera_slug ?? config.default_camera_slug ?? null;
    if (angleSlug) {
      const supabase = getServiceClient();
      const { data: ang } = await supabase
        .from('image_camera_angles')
        .select('angle_en')
        .eq('slug', angleSlug)
        .eq('is_active', true)
        .maybeSingle();
      const angleEn = (ang as { angle_en?: string } | null)?.angle_en?.trim();
      if (angleEn) {
        const { appendCameraAngle } = await import('@/lib/image/camera-angles');
        // Tanpa maxLen: prompt user tidak dipotong (batasan max_prompt_length
        // hanya untuk textarea UX, bukan prompt provider).
        composed = appendCameraAngle(composed, angleEn);
      }
    }
    if (styleSuffix) composed = `${composed}, ${styleSuffix}`;
    const finalNegative = mergeImageNegativePrompts(row.negative_prompt, target.style?.negative_prompt);

    const supabase = getServiceClient();
    const { data: provs } = await supabase
      .from('image_providers')
      .select('*')
      .eq('is_active', true)
      .order('priority');
    // Pin manual user: hanya provider terpilih (gagal jujur, tanpa fallback
    // lintas-provider). Auto: waterfall prioritas seperti semula.
    const providers = target.pinned
      ? [target.provider]
      : ((provs ?? []) as unknown as ImageProviderRow[]).sort((a, b) =>
          a.id === target.provider.id ? -1 : b.id === target.provider.id ? 1 : 0
        );

    let lastError: unknown = null;
    for (const provider of providers) {
      let modelRow: ImageModelRow | null = null;
      if (provider.id === target.provider.id) {
        modelRow = target.model;
      } else {
        const { data: mods } = await supabase
          .from('image_models')
          .select('*')
          .eq('provider_id', provider.id)
          .eq('is_active', true)
          .order('priority');
        const rows = (mods ?? []) as unknown as ImageModelRow[];
        modelRow = rows.find((m) => m.is_default) ?? rows[0] ?? null;
      }
      if (!modelRow) continue;
      try {
        const pool = new ImageKeyPool(provider);
        const { result, keyRow } = await pool.withFallback(async (apiKey) => {
          const adapter = createImageAdapter(provider, modelRow!.model_id, apiKey);
          return adapter.generateImage({ prompt: composed, negativePrompt: finalNegative, aspectRatio: target.aspect });
        });
        let bytes: Uint8Array;
        let mime = result.mimeType;
        if (result.imageBytes) {
          bytes = result.imageBytes;
        } else if (result.imageUrl) {
          const fetched = await fetchRemoteImage(result.imageUrl);
          bytes = fetched.bytes;
          mime = fetched.mimeType;
        } else {
          throw new Error(`${provider.slug} tidak mengembalikan bytes maupun url`);
        }
        const { storagePath, publicUrl } = await uploadUserImage(row.user_id, imageId, bytes, mime);
        await markImageModelUsage(modelRow.id);
        await supabase
          .from('user_image_generations')
          .update({
            status: 'ready',
            provider_slug: provider.slug,
            model_slug: modelRow.model_id,
            storage_path: storagePath,
            public_url: publicUrl,
            width: result.width ?? null,
            height: result.height ?? null,
            last_error: null,
            llm_meta: {
            provider: provider.slug,
            model: modelRow.model_id,
            key_suffix: keyRow.key_suffix,
            // Jejak audit: pin vs waterfall, agar hasil "bukan pilihan saya"
            // bisa dibedakan dari bug (kasus cloudflare→pixazo 11 Sep 2026).
            pinned: target.pinned,
            requested_provider_id: row.provider_id,
            requested_model_id: row.model_id
          },
            updated_at: new Date().toISOString()
          })
          .eq('id', imageId);
        return { imageId };
      } catch (e) {
        lastError = e;
        if (e instanceof ImageHttpError && [401, 403, 429].includes(e.status)) {
          await markImageModelFailure(modelRow.id);
        }
        continue;
      }
    }
    const message = lastError instanceof Error ? lastError.message : String(lastError);
    await failStudioImage(imageId, message);
    return { imageId: null, error: message };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await failStudioImage(imageId, message);
    return { imageId: null, error: message };
  }
}

/**
 * Hapus histori expired (row + file Storage). `retention_days` dibaca live
 * dari config, tapi `expires_at` per-baris tetap sumber utama agar perubahan
 * config tidak menghidupkan kembali baris lama.
 */
export async function cleanupExpiredStudioImages(limit = 200): Promise<{ deleted: number; errors: string[] }> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from('user_image_generations')
    .select('id, storage_path')
    .lt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: true })
    .limit(limit);
  const rows = (data ?? []) as { id: string; storage_path: string | null }[];
  let deleted = 0;
  const errors: string[] = [];
  for (const r of rows) {
    try {
      if (r.storage_path) {
        await removeUserImage(r.storage_path).catch(() => {});
      }
      await supabase.from('user_image_generations').delete().eq('id', r.id);
      deleted += 1;
    } catch (e) {
      errors.push(`${r.id}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200));
    }
  }
  return { deleted, errors };
}
