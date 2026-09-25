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
import { buildImagePromptMessages, parseImagePrompt, validateImagePromptContradiction, mergeImageNegativePrompts, buildComposeReviewMessages, parseComposeReview } from './prompt';
import type { ImageReasoning, ComposeAudit } from './prompt';
import { fetchRemoteImage, uploadDraftImage } from './storage';
import {
  IMAGE_MAX_ATTEMPTS,
  IMAGE_STUCK_MINUTES,
  ImageHttpError,
  bytesToBase64,
  clampImg2ImgStrength,
  modelRendersText,
  modelSupportsReference,
  resolveEffectiveAdvanced,
  stripNoTextClause
} from './types';
import type {
  DraftImageRow,
  ImageAspect,
  ImageModelRow,
  ImageProviderRow
} from './types';

const MAX_ATTEMPTS = IMAGE_MAX_ATTEMPTS;

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

/**
 * Klaim 1 baris pending per jalur (atomic via eq status) → attempts+1.
 * - 'generate': prompt terisi (Generate manual/review) — prioritas user.
 * - 'reasoning': prompt kosong (cover auto) — reasoning LLM saja.
 * Semua writer mengisi image_prompt eksplisit ('' = auto), jadi eq/neq
 * cukup tanpa OR-null.
 */
export type ImageQueueLane = 'generate' | 'reasoning';
export async function claimPendingImage(
  lane: ImageQueueLane,
  excludeId?: string | null
): Promise<DraftImageRow | null> {
  const supabase = getServiceClient();
  let query = supabase
    .from('content_draft_images')
    .select('*')
    .eq('status', 'pending')
    .lt('attempts', MAX_ATTEMPTS);
  query = lane === 'generate' ? query.neq('image_prompt', '') : query.eq('image_prompt', '');
  if (excludeId) query = query.neq('id', excludeId);
  const { data: pending } = await query
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

/**
 * Reaper baris `pending` yang kehabisan attempts.
 *
 * Kasus 2d2a5b31: tick worker diklaim (attempts++) lalu invocation dibunuh
 * (maxDuration) sebelum hasil apa pun tersimpan — status tetap `pending`,
 * `last_error` NULL. Setelah attempts mencapai MAX, claim mensyaratkan
 * `attempts < MAX` sehingga baris itu tak akan pernah diproses lagi dan UI
 * hanya menampilkan "menunggu worker" selamanya. Reaper mengubahnya jadi
 * `failed` + pesan jujur agar tombol Ulangi muncul dan automation tidak
 * menunggu sia-sia.
 *
 * Guard `updated_at < now - IMAGE_STUCK_MINUTES`: baris yang baru saja diklaim
 * tick lain tidak boleh ditandai (masih diproses).
 */
export async function reapStuckImages(): Promise<number> {
  const supabase = getServiceClient();
  const cutoff = new Date(Date.now() - IMAGE_STUCK_MINUTES * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('content_draft_images')
    .update({
      status: 'failed',
      last_error: `worker tick timeout/terputus — attempts habis (${MAX_ATTEMPTS}/${MAX_ATTEMPTS}), tekan Ulangi`,
      updated_at: new Date().toISOString()
    })
    .eq('status', 'pending')
    .gte('attempts', MAX_ATTEMPTS)
    .lt('updated_at', cutoff)
    .select('id');
  return Array.isArray(data) ? data.length : 0;
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

async function defaultModel(providerId: string, preferredModelId?: string, needsReference = false): Promise<ImageModelRow | null> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from('image_models')
    .select('*')
    .eq('provider_id', providerId)
    .eq('is_active', true)
    .order('priority', { ascending: true });
  let rows = (data ?? []) as unknown as ImageModelRow[];
  if (needsReference) {
    const supported = rows.filter((m) => modelSupportsReference({ model_id: m.model_id, config: m.config }));
    if (supported.length > 0) rows = supported;
  }
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
export async function processImageTick(): Promise<{ imageId: string | null; processed: number; error?: string }> {
  // Reaper dulu: baris pending yang kehabisan attempts (tick sebelumnya
  // terputus di tengah) dipulihkan jadi `failed` + pesan jujur agar bisa
  // di-ulang user / di-requeue automation.
  await reapStuckImages();
  // Dua jalur per tick agar Generate manual tak diblokir reasoning cover
  // auto (kasus e5866cc7: manual antre di belakang 20 cover). Generate
  // diproses dulu (prioritas user), lalu 1 reasoning bila ada.
  const rows: DraftImageRow[] = [];
  const genRow = await claimPendingImage('generate');
  if (genRow) rows.push(genRow);
  const reasonRow = await claimPendingImage('reasoning', genRow?.id ?? null);
  if (reasonRow) rows.push(reasonRow);
  if (rows.length === 0) {
    const enqueued = await enqueueNextMissingImage();
    if (!enqueued) return { imageId: null, processed: 0 };
    const fresh = await claimPendingImage('reasoning');
    if (!fresh) return { imageId: null, processed: 0 };
    rows.push(fresh);
  }
  let firstId: string | null = null;
  let lastError: string | undefined;
  for (const claimed of rows) {
    const res = await processClaimedImage(claimed);
    if (res.imageId && !firstId) firstId = res.imageId;
    if (res.error) lastError = res.error;
  }
  return { imageId: firstId, processed: rows.length, ...(lastError ? { error: lastError } : {}) };
}

/** Proses 1 baris yang sudah diklaim (klaim milik caller). */
async function processClaimedImage(row: DraftImageRow): Promise<{ imageId: string | null; error?: string }> {
  const imageId = row.id;
  // Snapshot + audit yang diisi sepanjang proses; dipakai di success/fail path.
  // eslint-disable-next-line prefer-const
  let finalPrompt = '';
  let finalNegative: string | undefined;
  const composeAudit: ComposeAudit = { mode: 'deterministic', dropped: [], conflict_note: null };

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
    const needsReference = Boolean(row.reference_public_url?.trim());
    const target = await resolveImageTarget({
      sessionId: ctx.sessionId,
      draftOverride: override ?? null,
      needsReference
    });

    // Prompt: pakai yang sudah ada (regenerate simpan prompt / custom edit) atau reasoning-only bila kosong.
    const imagePrompt = row.image_prompt?.trim() || '';
    const userNegative = row.negative_prompt ?? undefined;
    const styleNegative = target.style?.negative_prompt?.trim();
    finalNegative = mergeImageNegativePrompts(userNegative, styleNegative);
    const promptMeta: Record<string, unknown> = {};
    const reasoning: Record<string, unknown> | null =
      (row as { reasoning?: Record<string, unknown> | null }).reasoning ?? null;
    const isCustom = Boolean(imagePrompt) && (reasoning as { visual_strategy?: string } | null)?.visual_strategy === 'custom';
    if (isCustom) {
      const gate = validateImagePromptContradiction(
        { image_prompt: imagePrompt, negative_prompt: userNegative ?? undefined, reasoning: reasoning as unknown as ImageReasoning },
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
    const styleSuffixRaw = target.style?.prompt_suffix?.trim() || '';
    // Model text-capable (Phoenix/Lucid): kecualikan klausa "no text" agar
    // keunggulan render teks model tidak dibatalkan komposisi prompt.
    const styleSuffix = modelRendersText({ model_id: target.model.model_id, config: target.model.config })
      ? stripNoTextClause(styleSuffixRaw)
      : styleSuffixRaw;
    // Camera angle: fetch EN text (diperlukan untuk LLM compose).
    let angleEn: string | null = null;
    const camSlug = row.camera_slug ?? null;
    if (camSlug) {
      const supabase = getServiceClient();
      const { data: cam } = await supabase
        .from('image_camera_angles')
        .select('angle_en')
        .eq('slug', camSlug)
        .eq('is_active', true)
        .maybeSingle();
      angleEn = (cam as { angle_en?: string } | null)?.angle_en?.trim() ?? null;
    }
    // LLM-compose final prompt: gabung image_prompt + angle + style suffix.
    // Fallback deterministik bila LLM gagal (tetap lancarkan generate).
    let finalPrompt: string;
    let composeAudit: ComposeAudit = { mode: 'deterministic', dropped: [], conflict_note: null };
    if (imagePrompt.trim()) {
      try {
        const { system, user } = buildComposeReviewMessages({
          imagePrompt,
          angleEn,
          styleSuffix: styleSuffix || null,
          aspect: '' // aspect tidak dipakai di user prompt LLM (hanya untuk konteks)
        });
        const { providerId, modelUuid } = await resolveStageModel('image_prompt', undefined);
        const svc = getServiceClient();
        const out = await runLLMCompletion(svc, {
          stage: 'image_prompt',
          providerId,
          modelUuid,
          messages: [
            { role: 'system' as const, content: system },
            { role: 'user' as const, content: user }
          ],
          temperature: 0.2,
          maxTokens: 500
        });
        const composed = parseComposeReview(out.output.text);
        finalPrompt = composed.final_prompt;
        composeAudit = { mode: 'llm', dropped: composed.dropped, conflict_note: composed.conflict_note };
      } catch {
        // Fallback deterministik: tempel angle + style suffix via concatenation.
        const { appendCameraAngle } = await import('./camera-angles');
        let withAngle = imagePrompt;
        if (angleEn) withAngle = appendCameraAngle(withAngle, angleEn);
        finalPrompt = styleSuffix ? `${withAngle}, ${styleSuffix}` : withAngle;
      }
    } else {
      // Reasoning-only path sudah selesai di atas (prompt_ready); baris ini hanya untuk jaga-jaga.
      finalPrompt = imagePrompt;
    }
    const aspect: ImageAspect = target.aspect;
    // Advanced (picker review <details>): NULL = Auto/default model. Jalur
    // Auto di-clamp hemat (≤1024px / ≤25 steps); pin manual sampai maks model.
    const adv = resolveEffectiveAdvanced(
      { model_id: target.model.model_id, config: target.model.config },
      { guidance: row.guidance, steps: row.steps, seed: row.seed, req_width: row.req_width, req_height: row.req_height },
      target.pinned
    );

    // Waterfall provider: resolved dulu, lalu sisanya sesuai prioritas.
    // Pin manual admin (override review): hanya provider terpilih — gagal
    // jujur tanpa fallback lintas-provider. Auto/sesi/global: waterfall.
    const providers = target.pinned ? [target.provider] : await orderedProviders(target.provider.id);
    // Referensi img2img: fetch bytes SEKALI sebelum loop (hemat bandwidth).
    // Gagal fetch → failed jujur tanpa memanggil provider mana pun.
    const referenceUrl = row.reference_public_url?.trim() || null;
    const referenceStrength = clampImg2ImgStrength(
      typeof row.reference_strength === 'string' ? Number(row.reference_strength) : row.reference_strength
    );
    let referenceB64: string | null = null;
    if (referenceUrl) {
      try {
        const fetched = await fetchRemoteImage(referenceUrl, 30000);
        referenceB64 = bytesToBase64(fetched.bytes);
      } catch (e) {
        const message = e instanceof Error ? `referensi gagal diambil: ${e.message}` : 'referensi gagal diambil';
        await failImage(imageId, message);
        return { imageId: null, error: message };
      }
    }
    let lastError: unknown = null;
    for (const provider of providers) {
      const modelRow =
        provider.id === target.provider.id
          ? target.model
          : await defaultModel(provider.id, undefined, referenceB64 ? true : false);
      if (!modelRow) continue;
      // Guard waterfall: baris referensi tidak boleh jatuh ke model
      // non-support — lewati ke kandidat berikut.
      if (referenceB64 && !modelSupportsReference({ model_id: modelRow.model_id, config: modelRow.config })) {
        continue;
      }
      try {
        const pool = new ImageKeyPool(provider);
        const { result, keyRow } = await pool.withFallback(async (apiKey) => {
          const adapter = createImageAdapter(provider, modelRow.model_id, apiKey, modelRow.config);
          const advForModel = provider.id === target.provider.id
            ? adv
            : resolveEffectiveAdvanced(
                { model_id: modelRow.model_id, config: modelRow.config },
                { guidance: row.guidance, steps: row.steps, seed: row.seed, req_width: row.req_width, req_height: row.req_height },
                // Waterfall lintas-provider = tidak di-pin untuk model pengganti.
                false
              );
          return adapter.generateImage({
            prompt: finalPrompt,
            negativePrompt: finalNegative,
            aspectRatio: aspect,
            ...(advForModel.guidance !== undefined ? { guidance: advForModel.guidance } : {}),
            ...(advForModel.numSteps !== undefined ? { numSteps: advForModel.numSteps } : {}),
            ...(advForModel.seed !== undefined ? { seed: advForModel.seed } : {}),
            ...(advForModel.width !== undefined ? { width: advForModel.width } : {}),
            ...(advForModel.height !== undefined ? { height: advForModel.height } : {}),
            ...(referenceB64 ? { referenceImageB64: referenceB64, strength: referenceStrength } : {})
          });
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
            negative_prompt: userNegative ?? null,
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
             llm_meta: {
               ...promptMeta,
               provider: provider.slug,
               model: modelRow.model_id,
               key_suffix: keyRow.key_suffix,
               // Jejak audit: pin vs waterfall (kasus cloudflare→pixazo 11 Sep 2026).
               pinned: target.pinned,
               // Jejak audit img2img: referensi dipakai atau tidak + strength.
               reference: referenceB64 ? true : false,
               reference_strength: referenceB64 ? referenceStrength : null,
               // Jejak audit advanced: nilai efektif terkirim + flag clamp Auto.
               advanced: adv.audit,
               advanced_clamped: adv.clamped,
               // Snapshot prompt final + audit komposisi (Task D+E).
               final_prompt: finalPrompt,
               final_negative: finalNegative ?? null,
               compose_audit: composeAudit
             },
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
        // Simpan snapshot final prompt sebelum tandai failed (Task E).
        const supabaseFail = getServiceClient();
        await supabaseFail.from('content_draft_images').update({
          llm_meta: {
            ...(typeof row.llm_meta === 'object' && row.llm_meta !== null ? row.llm_meta : {}),
            final_prompt: finalPrompt,
            final_negative: finalNegative ?? null,
            compose_audit: composeAudit
          },
          updated_at: new Date().toISOString()
        }).eq('id', imageId);
        continue;
      }
    }
    const message = lastError instanceof Error ? lastError.message : String(lastError);
    // Snapshot final prompt pada semua jalur gagal (Task E).
    const supabaseFailAll = getServiceClient();
    await supabaseFailAll.from('content_draft_images').update({
      llm_meta: {
        ...(typeof row.llm_meta === 'object' && row.llm_meta !== null ? row.llm_meta : {}),
        final_prompt: finalPrompt,
        final_negative: finalNegative ?? null,
        compose_audit: composeAudit
      },
      updated_at: new Date().toISOString()
    }).eq('id', imageId);
    await failImage(imageId, message);
    return { imageId: null, error: message };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Snapshot final prompt sebelum tandai failed (Task E).
    const supabaseFailOuter = getServiceClient();
    await supabaseFailOuter.from('content_draft_images').update({
      llm_meta: {
        ...(typeof row.llm_meta === 'object' && row.llm_meta !== null ? row.llm_meta : {}),
        final_prompt: finalPrompt,
        final_negative: finalNegative ?? null,
        compose_audit: composeAudit
      },
      updated_at: new Date().toISOString()
    }).eq('id', imageId);
    await failImage(imageId, message);
    return { imageId: null, error: message };
  }
}
