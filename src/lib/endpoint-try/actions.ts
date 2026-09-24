'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/require-user';
import { isAdmin } from '@/lib/auth/is-admin';
import { createSupabaseService } from '@/lib/supabase/server';
import type { EndpointTryRunRow, SaveEndpointTryRunInput, EndpointTryQuota } from './types';

function svc() {
  const supabase = createSupabaseService();
  if (!supabase) throw new Error('Supabase belum dikonfigurasi.');
  return supabase;
}

export type EndpointTryActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

interface LabConfigRow {
  id: number;
  retention_days: number;
  daily_limit: number | null;
}

async function getLabConfig(): Promise<LabConfigRow> {
  try {
    const { data } = await svc()
      .from('chat_lab_config')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (!data) return { id: 1, retention_days: 30, daily_limit: 50 };
    return data as unknown as LabConfigRow;
  } catch {
    return { id: 1, retention_days: 30, daily_limit: 50 };
  }
}

/**
 * Simpan snapshot 1 percobaan chat (bukan per-target, melainkan per-stream/non-stream
 * tunggal). Tidak menyimpan key sama sekali — hanya snapshot base_url (bukan secret).
 */
export async function saveEndpointTryRun(
  input: SaveEndpointTryRunInput
): Promise<EndpointTryActionResult<{ id: string }>> {
  try {
    // Guard defensif: tidak ada properti yang resembles key/authorization di input.
    const keys = Object.keys(input);
    for (const k of keys) {
      const lower = k.toLowerCase();
      if (
        lower.includes('api_key') ||
        lower.includes('apikey') ||
        lower.includes('authorization')
      ) {
        return fail(new Error('API key tidak boleh dikirim ke penyimpanan.'));
      }
    }
    if (
      (input.error == null && input.responseText == null) ||
      (input.error === null && input.responseText === null)
    ) {
      return fail(new Error('Simpan gagal — salah satu dari error atau response_text wajib diisi.'));
    }
    if (input.userPrompt.length < 10 || input.userPrompt.length > 4000) {
      return fail(new Error('user_prompt harus 10–4000 karakter.'));
    }
    if (
      input.baseUrl.length < 10 ||
      input.baseUrl.length > 500 ||
      input.model.length < 1 ||
      input.model.length > 200
    ) {
      return fail(new Error('base_url/model tidak sesuai batasan tabel.'));
    }
    const { id: userId } = await requireUser();
    const config = await getLabConfig();
    if (config.daily_limit != null) {
      const dayStart = new Date();
      dayStart.setUTCHours(0, 0, 0, 0);
      const { count } = await svc()
        .from('endpoint_try_runs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', dayStart.toISOString());
      const used = count ?? 0;
      if (used >= config.daily_limit) {
        return fail(new Error(`Kuota harian habis (${config.daily_limit}/hari) — coba lagi besok.`));
      }
    }
    const expiresAt = new Date(
      Date.now() + (config.retention_days ?? 30) * 24 * 60 * 60 * 1000
    ).toISOString();
    const { data, error } = await svc().from('endpoint_try_runs').insert({
      user_id: userId,
      provider_kind: input.providerKind,
      base_url: input.baseUrl,
      model: input.model,
      system_prompt: input.systemPrompt,
      user_prompt: input.userPrompt,
      temperature: input.temperature,
      max_tokens: input.maxTokens,
      prompt_tokens: input.promptTokens,
      completion_tokens: input.completionTokens,
      total_tokens: input.totalTokens,
      latency_ms: input.latencyMs,
      tokens_per_sec: input.tokensPerSec,
      finish_reason: input.finishReason,
      error: input.error,
      request_messages: input.requestMessages,
      response_text: input.responseText,
      expires_at: expiresAt
    }).select('id').single();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Gagal menyimpan run — coba lagi.');
    revalidatePath('/lab/try');
    return { ok: true, data: { id: (data as { id: string }).id } };
  } catch (e) {
    return fail(e);
  }
}

export interface ListOptions {
  page?: number;
  pageSize?: number;
}

/** Riwayat miliknya sendiri (expired disaring via WHERE). */
export async function listEndpointTryRuns(
  options?: ListOptions
): Promise<{ items: EndpointTryRunRow[]; total: number; page: number; pageSize: number; totalPages: number }> {
  const { id: userId } = await requireUser();
  const supabase = svc();
  const page = Math.max(1, options?.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, options?.pageSize ?? 10));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const now = new Date().toISOString();
  const { data, error, count } = await supabase
    .from('endpoint_try_runs')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .gte('expires_at', now)
    .order('created_at', { ascending: false })
    .range(from, to);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as EndpointTryRunRow[];
  const total = count ?? 0;
  return {
    items: rows,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  };
}

/** Hapus 1 run miliknya sendiri (owner atau admin). */
export async function deleteEndpointTryRun(id: string): Promise<EndpointTryActionResult> {
  try {
    if (!id) throw new Error('runId wajib diisi.');
    const { id: userId } = await requireUser();
    const supabase = svc();
    const { data: row } = await supabase
      .from('endpoint_try_runs')
      .select('id, user_id')
      .eq('id', id)
      .maybeSingle();
    const r = row as { id: string; user_id: string } | null;
    if (!r) throw new Error('Run tidak ditemukan.');
    if (r.user_id !== userId && !(await isAdmin())) throw new Error('Run tidak ditemukan.');
    const { error } = await supabase.from('endpoint_try_runs').delete().eq('id', id);
    if (error) throw new Error(error.message);
    revalidatePath('/lab/try');
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

/** Sisa kuota harian (reuse config Lab). */
export async function getEndpointTryQuota(): Promise<EndpointTryQuota> {
  const { id: userId } = await requireUser();
  const config = await getLabConfig();
  if (config.daily_limit == null) return { used: 0, limit: null, remaining: null };
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const { count } = await svc()
    .from('endpoint_try_runs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', dayStart.toISOString());
  const used = count ?? 0;
  return { used, limit: config.daily_limit, remaining: Math.max(0, config.daily_limit - used) };
}

/** Hapus run expired (runs CASCADE karena FK ON DELETE CASCADE). Dipanggil cron cleanup. */
export async function cleanupExpiredEndpointTryRuns(): Promise<{ deletedRuns: number }> {
  const supabase = svc();
  const { data, error } = await supabase
    .from('endpoint_try_runs')
    .delete()
    .lt('expires_at', new Date().toISOString())
    .select('id');
  if (error) throw new Error(error.message);
  return { deletedRuns: (data ?? []).length };
}
