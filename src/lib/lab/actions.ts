'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/require-user';
import { isAdmin } from '@/lib/auth/is-admin';
import { createSupabaseService } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/supabase/service';
import { runLLMCompletion } from '@/lib/llm/completion';
import { isLengthCutoff } from '@/lib/llm/model-config';
import { checkRateLimit, getClientIp, incrementRateLimit } from '@/lib/content/rate-limit';
import {
  DEFAULT_LAB_CONFIG,
  type LabBatchRow,
  type LabBatchWithRuns,
  type LabConfig,
  type LabListOptions,
  type LabOptions,
  type LabQuota,
  type LabRunRow,
  type LabTarget
} from './types';
import { buildLabExpiry, labInputSchema, validateLabTargetLink } from './validation';
import { summarizeLabRuns, tokensPerSec, type LabSummary } from './stats';

function svc() {
  const supabase = createSupabaseService();
  if (!supabase) throw new Error('Supabase belum dikonfigurasi.');
  return supabase;
}

/**
 * Hasil server action Chat Lab. Error dikembalikan sebagai data (`ok:false`),
 * BUKAN di-throw: Next.js production menyamarkan error yang dilempar dari
 * Server Action menjadi digest generik, sehingga pesan asli tak sampai ke UI
 * (pola yang sama dengan Studio).
 */
export type LabActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

/** Baca config lab (service_role; fallback default bila tabel belum ada). */
export async function getLabConfig(): Promise<LabConfig> {
  try {
    const { data } = await svc().from('chat_lab_config').select('*').eq('id', 1).maybeSingle();
    if (!data) return DEFAULT_LAB_CONFIG;
    return { ...DEFAULT_LAB_CONFIG, ...(data as LabConfig) };
  } catch {
    return DEFAULT_LAB_CONFIG;
  }
}

/**
 * Opsi picker lab (tanpa secret): provider+model LLM aktif.
 * Auto tidak tersedia di Lab — komparasi wajib pin eksplisit agar adil.
 */
export async function listLabOptions(): Promise<LabOptions> {
  await requireUser();
  const supabase = svc();
  const config = await getLabConfig();
  const [{ data: providers }, { data: models }] = await Promise.all([
    supabase.from('llm_providers').select('id, slug, display_name').eq('is_active', true).order('priority'),
    supabase
      .from('llm_models')
      .select('id, provider_id, model_id, display_name')
      .eq('is_active', true)
      .order('priority')
  ]);
  return {
    providers: (providers ?? []) as LabOptions['providers'],
    models: (models ?? []) as LabOptions['models'],
    config
  };
}

export interface RunLabBatchInput {
  systemPrompt?: string | null;
  userPrompt: string;
  temperature?: number | null;
  maxTokens?: number | null;
  targets: LabTarget[];
}

/**
 * Jalankan 1 batch komparasi: fan-out paralel ke 1–3 target (strict-pin,
 * tanpa fallback global agar adil), simpan batch + runs milik user.
 * Sinkron (langsung panggil LLM, tanpa antrean cron — beda dari Studio image).
 * Setiap run juga tercatat di `llm_call_logs` (`stage='chat_lab'`) oleh
 * `runLLMCompletion` untuk observabilitas admin global.
 */
export async function runChatLabBatch(
  input: RunLabBatchInput
): Promise<LabActionResult<{ batchId: string }>> {
  try {
    return { ok: true, data: await runChatLabBatchImpl(input) };
  } catch (e) {
    return fail(e);
  }
}

async function runChatLabBatchImpl(input: RunLabBatchInput): Promise<{ batchId: string }> {
  const { id: userId } = await requireUser();
  const supabase = svc();
  const config = await getLabConfig();

  const parsed = labInputSchema(config.max_targets).safeParse({
    systemPrompt: input.systemPrompt ?? null,
    userPrompt: input.userPrompt,
    temperature: input.temperature ?? null,
    maxTokens: input.maxTokens ?? null,
    targets: input.targets
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Input tidak valid.');
  }
  const v = parsed.data;

  // Tolak target duplikat (model sama 2× = biaya ganda tanpa informasi baru).
  const seen = new Set(v.targets.map((t) => t.modelId));
  if (seen.size !== v.targets.length) throw new Error('Target duplikat — pilih model yang berbeda.');

  // Validasi FK aktif (sekali jalan, tanpa secret).
  const [{ data: provs }, { data: mods }] = await Promise.all([
    supabase.from('llm_providers').select('id').eq('is_active', true),
    supabase.from('llm_models').select('id, provider_id, model_id, display_name').eq('is_active', true)
  ]);
  const providerIds = new Set(((provs ?? []) as { id: string }[]).map((p) => p.id));
  const modelRows = (mods ?? []) as { id: string; provider_id: string; model_id: string; display_name: string }[];
  for (const t of v.targets) {
    if (!providerIds.has(t.providerId)) throw new Error('Provider tidak aktif — refresh pilihan.');
    if (!modelRows.some((m) => m.id === t.modelId)) throw new Error('Model tidak aktif — refresh pilihan.');
    const linkErr = validateLabTargetLink(t.providerId, t.modelId, modelRows);
    if (linkErr) throw new Error(linkErr);
  }

  // Rate limit 30/jam (bucket sendiri: chat_lab) + kuota harian per user.
  const hdrs = await headers();
  const ip = getClientIp(hdrs);
  const { allowed, count } = await checkRateLimit(ip, 'chat_lab', 30);
  if (!allowed) throw new Error(`rate_limit:${count} — chat lab 30/jam`);
  if (config.daily_limit !== null) {
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const { count: used } = await supabase
      .from('chat_lab_batches')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', dayStart.toISOString());
    if ((used ?? 0) >= config.daily_limit) {
      throw new Error(`Kuota harian habis (${config.daily_limit}/hari) — coba lagi besok.`);
    }
  }

  const messages = [
    ...(v.systemPrompt ? [{ role: 'system' as const, content: v.systemPrompt }] : []),
    { role: 'user' as const, content: v.userPrompt }
  ];
  const temperature = v.temperature ?? config.default_temperature ?? undefined;
  const maxTokens = v.maxTokens ?? config.default_max_tokens;

  // Fan-out paralel; tiap target strict-pin (gagal = error jujur, tanpa fallback).
  const settled = await Promise.allSettled(
    v.targets.map(async (t) => {
      const llm = getServiceClient();
      const out = await runLLMCompletion(llm, {
        stage: 'chat_lab',
        providerId: t.providerId,
        modelUuid: t.modelId,
        messages,
        temperature: temperature ?? undefined,
        maxTokens,
        strictPinned: true
      });
      return { target: t, out };
    })
  );

  const expiresAt = buildLabExpiry(new Date(), config.retention_days);
  const { data: batch, error: batchError } = await supabase
    .from('chat_lab_batches')
    .insert({
      user_id: userId,
      system_prompt: v.systemPrompt || null,
      user_prompt: v.userPrompt,
      temperature: v.temperature,
      max_tokens: v.maxTokens,
      expires_at: expiresAt
    })
    .select('id')
    .single();
  if (batchError || !batch) throw new Error(batchError?.message ?? 'Gagal menyimpan batch — coba lagi.');
  const batchId = (batch as { id: string }).id;

  const runRows = settled.map((s) => {
    if (s.status === 'fulfilled') {
      const { target, out } = s.value;
      const meta = modelRows.find((m) => m.id === target.modelId);
      const usage = out.output.usage;
      const completion = usage?.completionTokens ?? null;
      const latency = out.latencyMs ?? null;
      return {
        batch_id: batchId,
        user_id: userId,
        provider_id: target.providerId,
        model_id: target.modelId,
        provider_slug: out.providerSlug,
        model_slug: meta?.model_id ?? out.model,
        prompt_tokens: usage?.promptTokens ?? null,
        completion_tokens: completion,
        total_tokens: usage?.totalTokens ?? null,
        thought_tokens: out.output.thoughtTokens ?? null,
        latency_ms: latency,
        tokens_per_sec: tokensPerSec(completion, latency),
        ttft_ms: null,
        finish_reason: out.output.finishReason ?? null,
        is_fallback: out.fallback ?? false,
        response_truncated: isLengthCutoff(out.output.finishReason),
        http_status: 200,
        error: null,
        request_messages: messages,
        response_text: out.output.text.slice(0, 8000),
        expires_at: expiresAt
      };
    }
    // Target gagal (strict): catat error jujur sebagai run agar komparasi utuh.
    const message = s.reason instanceof Error ? s.reason.message : String(s.reason);
    return {
      batch_id: batchId,
      user_id: userId,
      provider_id: null,
      model_id: null,
      provider_slug: '',
      model_slug: '',
      prompt_tokens: null,
      completion_tokens: null,
      total_tokens: null,
      thought_tokens: null,
      latency_ms: null,
      tokens_per_sec: null,
      ttft_ms: null,
      finish_reason: null,
      is_fallback: false,
      response_truncated: false,
      http_status: null,
      error: message.slice(0, 2000),
      request_messages: messages,
      response_text: null,
      expires_at: expiresAt
    };
  });

  const { error: runsError } = await supabase.from('chat_lab_runs').insert(runRows);
  if (runsError) throw new Error(runsError.message);

  await incrementRateLimit(ip, 'chat_lab').catch(() => {});
  revalidatePath('/lab');
  return { batchId };
}

/**
 * Histori batch milik user (terbaru dulu) beserta runs-nya.
 * Filter provider/model/status diterapkan di memori (limit kecil, 50 batch).
 */
export async function listLabBatches(options?: LabListOptions): Promise<LabBatchWithRuns[]> {
  const { id: userId } = await requireUser();
  const supabase = svc();
  const limit = Math.min(50, Math.max(1, options?.limit ?? 20));
  const ascending = options?.dir === 'asc';
  const { data: batches, error } = await supabase
    .from('chat_lab_batches')
    .select('*')
    .eq('user_id', userId)
    .gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending })
    .limit(limit);
  if (error) throw new Error(error.message);
  const rows = (batches ?? []) as unknown as LabBatchRow[];
  if (rows.length === 0) return [];
  const { data: runs } = await supabase
    .from('chat_lab_runs')
    .select('*')
    .in('batch_id', rows.map((b) => b.id))
    .order('created_at', { ascending: true });
  const runRows = (runs ?? []) as unknown as LabRunRow[];
  const byBatch = new Map<string, LabRunRow[]>();
  for (const r of runRows) {
    const list = byBatch.get(r.batch_id) ?? [];
    list.push(r);
    byBatch.set(r.batch_id, list);
  }
  const providerSlug = options?.providerSlug || null;
  const modelSlug = options?.modelSlug || null;
  const status = options?.status ?? 'all';
  return rows
    .map((batch) => ({ batch, runs: byBatch.get(batch.id) ?? [] }))
    .filter(({ runs: rs }) => {
      if (providerSlug && !rs.some((r) => r.provider_slug === providerSlug)) return false;
      if (modelSlug && !rs.some((r) => r.model_slug === modelSlug)) return false;
      if (status === 'ok' && rs.some((r) => r.error)) return false;
      if (status === 'error' && !rs.some((r) => r.error)) return false;
      return true;
    });
}

/** Detail 1 batch milik user (owner atau admin). */
export async function getLabBatch(batchId: string): Promise<LabBatchWithRuns> {
  const { id: userId } = await requireUser();
  if (!batchId) throw new Error('batchId wajib diisi.');
  const supabase = svc();
  const { data: batch } = await supabase.from('chat_lab_batches').select('*').eq('id', batchId).maybeSingle();
  const b = batch as unknown as LabBatchRow | null;
  if (!b) throw new Error('Batch tidak ditemukan (mungkin sudah kedaluwarsa).');
  if (b.user_id !== userId && !(await isAdmin())) throw new Error('Batch tidak ditemukan.');
  const { data: runs } = await supabase
    .from('chat_lab_runs')
    .select('*')
    .eq('batch_id', batchId)
    .order('created_at', { ascending: true });
  return { batch: b, runs: (runs ?? []) as unknown as LabRunRow[] };
}

/** Hapus 1 batch milik user (runs ikut CASCADE). */
export async function deleteLabBatch(batchId: string): Promise<LabActionResult> {
  try {
    const { id: userId } = await requireUser();
    if (!batchId) throw new Error('batchId wajib diisi.');
    const supabase = svc();
    const { data: batch } = await supabase.from('chat_lab_batches').select('id, user_id').eq('id', batchId).maybeSingle();
    const b = batch as unknown as { id: string; user_id: string } | null;
    if (!b) throw new Error('Batch tidak ditemukan.');
    if (b.user_id !== userId && !(await isAdmin())) throw new Error('Batch tidak ditemukan.');
    const { error } = await supabase.from('chat_lab_batches').delete().eq('id', batchId);
    if (error) throw new Error(error.message);
    revalidatePath('/lab');
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

/** Sisa kuota batch hari ini (untuk badge di UI). */
export async function getLabQuota(): Promise<LabQuota> {
  const { id: userId } = await requireUser();
  const config = await getLabConfig();
  if (config.daily_limit === null) return { used: 0, limit: null, remaining: null };
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const { count } = await svc()
    .from('chat_lab_batches')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', dayStart.toISOString());
  const used = count ?? 0;
  return { used, limit: config.daily_limit, remaining: Math.max(0, (config.daily_limit ?? 0) - used) };
}

/** Ringkasan statistik 30 hari terakhir milik user (untuk chart). */
export async function getLabStats(): Promise<LabSummary> {
  const { id: userId } = await requireUser();
  const supabase = svc();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [{ count: batchCount }, { data: runs }] = await Promise.all([
    supabase.from('chat_lab_batches').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', since),
    supabase
      .from('chat_lab_runs')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(200)
  ]);
  return summarizeLabRuns(batchCount ?? 0, (runs ?? []) as unknown as LabRunRow[]);
}

/** Hapus batch expired (runs CASCADE). Dipanggil cron `/api/lab/cleanup`. */
export async function cleanupExpiredLabBatches(): Promise<{ deletedBatches: number }> {
  const supabase = svc();
  const { data, error } = await supabase
    .from('chat_lab_batches')
    .delete()
    .lt('expires_at', new Date().toISOString())
    .select('id');
  if (error) throw new Error(error.message);
  return { deletedBatches: (data ?? []).length };
}
