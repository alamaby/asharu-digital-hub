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
import { buildImagePromptMessages, parseImagePrompt, validateImagePromptContradiction } from './prompt';
import type { ImageReasoning } from './prompt';
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
  generated_thread: {
    main?: { id?: string; en?: string };
    replies?: { id?: string; en?: string }[];
  };
  research_topic_id: string | null;
  status: string;
}

/**
 * Enqueue auto cover (post_index=0): draf needs_review/approved tertua yang
 * belum punya image cover sama sekali → 1 baris pending. Worker mengubahnya
 * jadi draf prompt (status prompt_ready) — reasoning otomatis TANPA generate
 * image, agar user cek/edit prompt dulu di review. Per-reply TIDAK auto —
 * hanya via tombol review.
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
      .eq('draft_id', d.id)
      .eq('post_index', 0);
    if ((count ?? 0) === 0) {
      const { data: created, error } = await supabase
        .from('content_draft_images')
        .insert({ draft_id: d.id, post_index: 0, image_prompt: '', provider_slug: '', model_id: '' })
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
  keyFacts: string[];
  uniqueAngle: string | null;
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
    return { draft: d, sessionId: null, topicTitle: null, keyFacts: [], uniqueAngle: null };
  }
  const { data: topic } = await supabase
    .from('content_research_topics')
    .select('session_id, topic, key_facts, unique_angle')
    .eq('id', d.research_topic_id)
    .maybeSingle();
  const t = topic as { session_id: string; topic: string; key_facts: unknown; unique_angle: string | null } | null;
  return {
    draft: d,
    sessionId: t?.session_id ?? null,
    topicTitle: t?.topic ?? null,
    keyFacts: Array.isArray(t?.key_facts) ? (t.key_facts as string[]).filter((f) => typeof f === 'string') : [],
    uniqueAngle: t?.unique_angle ?? null
  };
}

interface ImagePromptLLMResult {
  prompt: string;
  negative?: string;
  reasoning: Record<string, unknown>;
  llmMeta: Record<string, unknown>;
}

function summarizeThread(replies: { id?: string; en?: string }[] | undefined): string {
  const list = replies ?? [];
  // Cuplikan: reply pertama + terakhir (arah + penutup), potong agar hemat token.
  const picks = [list[0]?.id, list[list.length - 1]?.id].filter(Boolean) as string[];
  return picks
    .map((t) => t.slice(0, 200))
    .join(' | ')
    .slice(0, 600);
}

async function runImagePromptLLM(
  mainId: string,
  mainEn: string,
  topicTitle: string | null,
  sessionId: string | null,
  styleSuffix: string | null,
  extra?: {
    keyFacts?: string[];
    uniqueAngle?: string | null;
    threadSnippet?: string;
    postIndex?: number;
  }
): Promise<ImagePromptLLMResult> {
  const supabase = getServiceClient();
  const baseInput = {
    mainId,
    mainEn,
    topic: topicTitle ?? undefined,
    keyFacts: extra?.keyFacts,
    uniqueAngle: extra?.uniqueAngle ?? undefined,
    threadSnippet: extra?.threadSnippet,
    postIndex: extra?.postIndex,
    styleSuffix: styleSuffix ?? undefined
  };
  const attempt = async (temperature: number, retryNote?: string) => {
    const { system, user } = buildImagePromptMessages(baseInput);
    const { providerId, modelUuid } = await resolveStageModel('image_prompt', undefined);
    const { output, providerSlug, model } = await runLLMCompletion(supabase, {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: retryNote ? `${user}\n\nPENTING: output sebelumnya gagal gate (${retryNote}). Perbaiki visual_strategy + image_prompt + negative_prompt.` : user }
      ],
      temperature,
      maxTokens: 500,
      providerId,
      modelUuid,
      sessionId,
      stage: 'image_prompt'
    });
    return { text: output.text, providerSlug, model };
  };
  const attemptParsed = async (temperature: number, retryNote?: string) => {
    const raw = await attempt(temperature, retryNote);
    return { parsed: parseImagePrompt(raw.text), providerSlug: raw.providerSlug, model: raw.model };
  };

  const sourceText = `${mainId} ${mainEn}`;
  // Gagal parse (model emit fragmen reasoning tanpa JSON, mis. output terpotong)
  // → 1x retry suhu rendah dengan penegasan JSON ONLY sebelum gagal jujur.
  let parseRetried = false;
  let first: { parsed: ReturnType<typeof parseImagePrompt>; providerSlug: string; model: string };
  try {
    first = await attemptParsed(0.7);
  } catch {
    parseRetried = true;
    const raw = await attempt(
      0.3,
      'Output sebelumnya bukan JSON valid — balas HANYA satu objek JSON {"visual_strategy": ..., "hook_keywords": [...], "contradiction_check": "...", "justification": "...", "image_prompt": "...", "negative_prompt": "..."}, tanpa teks/markdown lain.'
    );
    // Throw bila tetap gagal (last_error tercatat jujur oleh failImage).
    first = { parsed: parseImagePrompt(raw.text), providerSlug: raw.providerSlug, model: raw.model };
  }
  let gate = validateImagePromptContradiction(
    { image_prompt: first.parsed.image_prompt, negative_prompt: first.parsed.negative_prompt, reasoning: first.parsed.reasoning },
    sourceText
  );
  let chosen = first;
  let gateNotes: string[] = [];
  if (!gate.ok) {
    // 1x retry suhu rendah (parse juga bisa gagal di sini → throw jujur).
    gateNotes = gate.reasons;
    const second = await attemptParsed(0.3, gate.reasons.join('; '));
    gate = validateImagePromptContradiction(
      { image_prompt: second.parsed.image_prompt, negative_prompt: second.parsed.negative_prompt, reasoning: second.parsed.reasoning },
      sourceText
    );
    if (gate.ok) {
      chosen = second;
      gateNotes = [];
    } else {
      // Gagal jujur: jangan kirim prompt kontradiktif ke provider.
      throw new Error(`image_prompt gate: ${[...gateNotes, ...gate.reasons].join(' | ').slice(0, 300)}`);
    }
  }
  return {
    prompt: chosen.parsed.image_prompt,
    negative: chosen.parsed.negative_prompt,
    reasoning: { ...chosen.parsed.reasoning, gate_passed: true, gate_retried: gateNotes.length > 0 || parseRetried },
    llmMeta: { provider: chosen.providerSlug, model: chosen.model, stage: 'image_prompt' }
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
 * Proses 1 image: klaim → konteks draf → resolve target →
 * - prompt kosong: reasoning LLM saja → simpan draf prompt (prompt_ready),
 *   TANPA generate image (user cek/edit dulu di review, lalu Generate);
 * - prompt terisi (custom user / hasil review): generate via provider
 *   waterfall → upload Storage → selected.
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
    // Teks sumber prompt = post pada post_index itu (0 = main, 1..n = replies).
    const posts = [ctx.draft.generated_thread?.main, ...(ctx.draft.generated_thread?.replies ?? [])];
    const sourcePost = posts[row.post_index ?? 0];
    const mainId = sourcePost?.id ?? '';
    const mainEn = sourcePost?.en ?? '';
    if (!mainId && !mainEn) {
      await failImage(imageId, `draft post ${row.post_index ?? 0} empty`);
      return { imageId: null, error: `draft post ${row.post_index ?? 0} empty` };
    }

    const override = (row.llm_meta as { override?: { modelUuid?: string | null; styleSlug?: string | null } } | null)?.override;
    const target = await resolveImageTarget({
      sessionId: ctx.sessionId,
      draftOverride: override ?? null
    });

    // Prompt: pakai yang sudah ada (regenerate simpan prompt / custom edit) atau reasoning-only bila kosong.
    const imagePrompt = row.image_prompt?.trim() || '';
    const negative = row.negative_prompt ?? undefined;
    const promptMeta: Record<string, unknown> = {};
    const reasoning: Record<string, unknown> | null =
      (row as { reasoning?: Record<string, unknown> | null }).reasoning ?? null;
    const isCustom = Boolean(imagePrompt) && (reasoning as { visual_strategy?: string } | null)?.visual_strategy === 'custom';
    if (isCustom) {
      const gate = validateImagePromptContradiction(
        { image_prompt: imagePrompt, negative_prompt: negative ?? undefined, reasoning: reasoning as unknown as ImageReasoning },
        `${mainId} ${mainEn}`
      );
      if (!gate.ok) {
        await failImage(imageId, `custom prompt gate: ${gate.reasons.join(' | ').slice(0, 300)}`);
        return { imageId: null, error: gate.reasons.join(' | ') };
      }
      // Simpan reasoning custom apa adanya (dari actions); worker tidak generate ulang.
    } else if (!imagePrompt) {
      // Reasoning-only: siapkan draf prompt otomatis TANPA render image.
      const llm = await runImagePromptLLM(mainId, mainEn, ctx.topicTitle, ctx.sessionId, target.style?.prompt_suffix ?? null, {
        keyFacts: ctx.keyFacts,
        uniqueAngle: ctx.uniqueAngle,
        threadSnippet: summarizeThread(ctx.draft.generated_thread?.replies),
        postIndex: row.post_index ?? 0
      });
      const supabase = getServiceClient();
      await supabase
        .from('content_draft_images')
        .update({
          status: 'prompt_ready',
          image_prompt: llm.prompt,
          negative_prompt: llm.negative ?? null,
          reasoning: llm.reasoning,
          style_slug: target.style?.slug ?? row.style_slug,
          llm_meta: { ...llm.llmMeta, auto_reasoning: true },
          last_error: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', imageId);
      return { imageId };
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

        // Tandai selected per post: turunkan selected lama di post_index sama → ready.
        const supabase = getServiceClient();
        await supabase
          .from('content_draft_images')
          .update({ status: 'ready', updated_at: new Date().toISOString() })
          .eq('draft_id', row.draft_id)
          .eq('post_index', row.post_index ?? 0)
          .eq('status', 'selected');
        await supabase
          .from('content_draft_images')
          .update({
            status: 'selected',
            image_prompt: imagePrompt,
            negative_prompt: negative ?? null,
            reasoning,
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
        // Cover (post 0) tetap jadi selected_image_id draf agar social lama kompatibel.
        if ((row.post_index ?? 0) === 0) {
          await supabase.from('content_drafts').update({ selected_image_id: imageId }).eq('id', row.draft_id);
        }
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
