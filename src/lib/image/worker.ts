import 'server-only';
import { getServiceClient } from '@/lib/supabase/service';
import { runLLMCompletion } from '@/lib/llm/completion';
import { resolveStageModel } from '@/lib/llm/stage-defaults';
import { ImageKeyPool } from './key-pool';
import { createImageAdapter } from './providers';
import {
  markImageModelFailure,
  markImageModelUsage,
  resolveImageTarget
} from './config';
import { buildImagePromptMessages, parseImagePrompt } from './prompt';
import { fetchRemoteImage, uploadDraftImage } from './storage';
import { ImageHttpError } from './types';
import type {
  DraftImageRow,
  ImageAspect,
  ImageModelRow,
  ImageProviderRow
} from './types';

const MAX_ATTEMPTS = 3;

interface DraftRow {
  id: string;
  generated_thread: { main?: { id?: string; en?: string } };
  research_topic_id: string | null;
  status: string;
}

/**
 * Enqueue auto: draf needs_review/approved tertua yang belum punya image sama sekali
 * → 1 baris pending. Dipanggil worker tiap tick bila tidak ada pending.
 */
export async function enqueueNextMissingImage(): Promise<string | null> {
  const supabase = getServiceClient();
  const { data: drafts } = await supabase
    .from('content_drafts')
    .select('id')
    .in('status', ['needs_review', 'approved'])
    .order('created_at', { ascending: true })
    .limit(20);
  const rows = (drafts ?? []) as { id: string }[];
  for (const d of rows) {
    const { count } = await supabase
      .from('content_draft_images')
      .select('id', { count: 'exact', head: true })
      .eq('draft_id', d.id);
    if ((count ?? 0) === 0) {
      const { data: created, error } = await supabase
        .from('content_draft_images')
        .insert({ draft_id: d.id, image_prompt: '', provider_slug: '', model_id: '' })
        .select('id')
        .single();
      if (!error && created) return (created as { id: string }).id;
    }
  }
  return null;
}

/** Klaim 1 baris pending (atomic via eq status) → attempts+1. */
export async function claimPendingImage(): Promise<DraftImageRow | null> {
  const supabase = getServiceClient();
  const { data: pending } = await supabase
    .from('content_draft_images')
    .select('*')
    .eq('status', 'pending')
    .lt('attempts', MAX_ATTEMPTS)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  const row = (pending as DraftImageRow | null) ?? null;
  if (!row) return null;
  const { data: claimed } = await supabase
    .from('content_draft_images')
    .update({ attempts: row.attempts + 1, updated_at: new Date().toISOString() })
    .eq('id', row.id)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();
  return (claimed as DraftImageRow | null) ?? null;
}

async function failImage(imageId: string, message: string): Promise<void> {
  const supabase = getServiceClient();
  await supabase
    .from('content_draft_images')
    .update({ status: 'failed', last_error: message.slice(0, 500), updated_at: new Date().toISOString() })
    .eq('id', imageId);
}

async function loadDraftContext(draftId: string): Promise<{
  draft: DraftRow;
  sessionId: string | null;
  topicTitle: string | null;
} | null> {
  const supabase = getServiceClient();
  const { data: draft } = await supabase
    .from('content_drafts')
    .select('id, generated_thread, research_topic_id, status')
    .eq('id', draftId)
    .maybeSingle();
  if (!draft) return null;
  const d = draft as DraftRow;
  if (!d.research_topic_id) {
    return { draft: d, sessionId: null, topicTitle: null };
  }
  const { data: topic } = await supabase
    .from('content_research_topics')
    .select('session_id, topic, key_facts')
    .eq('id', d.research_topic_id)
    .maybeSingle();
  const t = topic as { session_id: string; topic: string; key_facts: string[] } | null;
  return { draft: d, sessionId: t?.session_id ?? null, topicTitle: t?.topic ?? null };
}

async function runImagePromptLLM(
  mainId: string,
  mainEn: string,
  topicTitle: string | null,
  sessionId: string | null,
  styleSuffix: string | null
): Promise<{ prompt: string; negative?: string; llmMeta: Record<string, unknown> }> {
  const supabase = getServiceClient();
  const { system, user } = buildImagePromptMessages({
    mainId,
    mainEn,
    topic: topicTitle ?? undefined,
    styleSuffix: styleSuffix ?? undefined
  });
  const { providerId, modelUuid } = await resolveStageModel('image_prompt', undefined);
  const { output, providerSlug, model } = await runLLMCompletion(supabase, {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature: 0.7,
    maxTokens: 300,
    providerId,
    modelUuid,
    sessionId,
    stage: 'image_prompt'
  });
  const parsed = parseImagePrompt(output.text);
  return {
    prompt: parsed.image_prompt,
    negative: parsed.negative_prompt,
    llmMeta: { provider: providerSlug, model, stage: 'image_prompt' }
  };
}

async function orderedProviders(firstProviderId: string): Promise<ImageProviderRow[]> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from('image_providers')
    .select('*')
    .eq('is_active', true)
    .order('priority', { ascending: true });
  const rows = (data ?? []) as unknown as ImageProviderRow[];
  rows.sort((a, b) => (a.id === firstProviderId ? -1 : b.id === firstProviderId ? 1 : 0));
  return rows;
}

async function defaultModel(providerId: string, preferredModelId?: string): Promise<ImageModelRow | null> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from('image_models')
    .select('*')
    .eq('provider_id', providerId)
    .eq('is_active', true)
    .order('priority', { ascending: true });
  const rows = (data ?? []) as unknown as ImageModelRow[];
  if (preferredModelId) {
    const pinned = rows.find((m) => m.model_id === preferredModelId);
    if (pinned) return pinned;
  }
  return rows.find((m) => m.is_default) ?? rows[0] ?? null;
}

/**
 * Proses 1 image: klaim → konteks draf → resolve target → LLM image_prompt →
 * generate (provider waterfall) → upload Storage → selected.
 * Kembalikan image id bila sukses, null bila tidak ada kerja / gagal jujur.
 */
export async function processOneImage(): Promise<{ imageId: string | null; error?: string }> {
  let row = await claimPendingImage();
  if (!row) {
    const enqueued = await enqueueNextMissingImage();
    if (!enqueued) return { imageId: null };
    row = await claimPendingImage();
    if (!row) return { imageId: null };
  }
  const imageId = row.id;

  try {
    const ctx = await loadDraftContext(row.draft_id);
    if (!ctx) {
      await failImage(imageId, 'draft not found');
      return { imageId: null, error: 'draft not found' };
    }
    const mainId = ctx.draft.generated_thread?.main?.id ?? '';
    const mainEn = ctx.draft.generated_thread?.main?.en ?? '';
    if (!mainId && !mainEn) {
      await failImage(imageId, 'draft thread empty');
      return { imageId: null, error: 'draft thread empty' };
    }

    const override = (row.llm_meta as { override?: { modelUuid?: string | null; styleSlug?: string | null } } | null)?.override;
    const target = await resolveImageTarget({
      sessionId: ctx.sessionId,
      draftOverride: override ?? null
    });

    // Prompt: pakai yang sudah ada (regenerate simpan prompt) atau generate via LLM.
    let imagePrompt = row.image_prompt?.trim() || '';
    let negative = row.negative_prompt ?? undefined;
    let promptMeta: Record<string, unknown> = {};
    if (!imagePrompt) {
      const llm = await runImagePromptLLM(mainId, mainEn, ctx.topicTitle, ctx.sessionId, target.style?.prompt_suffix ?? null);
      imagePrompt = llm.prompt;
      negative = llm.negative;
      promptMeta = llm.llmMeta;
    }
    const styleSuffix = target.style?.prompt_suffix?.trim() || '';
    const finalPrompt = styleSuffix ? `${imagePrompt}, ${styleSuffix}` : imagePrompt;
    const aspect: ImageAspect = target.aspect;

    // Waterfall provider: resolved dulu, lalu sisanya sesuai prioritas.
    const providers = await orderedProviders(target.provider.id);
    let lastError: unknown = null;
    for (const provider of providers) {
      const modelRow =
        provider.id === target.provider.id
          ? target.model
          : await defaultModel(provider.id);
      if (!modelRow) continue;
      try {
        const pool = new ImageKeyPool(provider);
        const { result, keyRow } = await pool.withFallback(async (apiKey) => {
          const adapter = createImageAdapter(provider, modelRow.model_id, apiKey);
          return adapter.generateImage({ prompt: finalPrompt, negativePrompt: negative, aspectRatio: aspect });
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
          throw new Error(`${provider.slug} returned neither bytes nor url`);
        }
        const { storagePath, publicUrl } = await uploadDraftImage(row.draft_id, imageId, bytes, mime);
        await markImageModelUsage(modelRow.id);

        // Tandai selected: turunkan selected lama → ready, lalu set baru.
        const supabase = getServiceClient();
        await supabase
          .from('content_draft_images')
          .update({ status: 'ready', updated_at: new Date().toISOString() })
          .eq('draft_id', row.draft_id)
          .eq('status', 'selected');
        await supabase
          .from('content_draft_images')
          .update({
            status: 'selected',
            image_prompt: imagePrompt,
            negative_prompt: negative ?? null,
            style_slug: target.style?.slug ?? row.style_slug,
            provider_slug: provider.slug,
            model_id: modelRow.model_id,
            key_suffix: keyRow.key_suffix,
            storage_path: storagePath,
            public_url: publicUrl,
            width: result.width ?? null,
            height: result.height ?? null,
            last_error: null,
            llm_meta: { ...promptMeta, provider: provider.slug, model: modelRow.model_id, key_suffix: keyRow.key_suffix },
            updated_at: new Date().toISOString()
          })
          .eq('id', imageId);
        await supabase.from('content_drafts').update({ selected_image_id: imageId }).eq('id', row.draft_id);
        return { imageId };
      } catch (e) {
        lastError = e;
        // 5xx/outage atau error konten bukan salah model? Bedakan: hanya
        // 401/403/429 + invalid-response yang menyalahkan model.
        if (e instanceof ImageHttpError && [401, 403, 429].includes(e.status)) {
          await markImageModelFailure(modelRow.id);
        }
        continue;
      }
    }
    const message = lastError instanceof Error ? lastError.message : String(lastError);
    await failImage(imageId, message);
    return { imageId: null, error: message };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await failImage(imageId, message);
    return { imageId: null, error: message };
  }
}
