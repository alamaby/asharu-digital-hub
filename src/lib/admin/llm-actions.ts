'use server';

import { revalidatePath } from 'next/cache';
import { createHash } from 'node:crypto';
import { isAdmin } from '@/lib/auth/is-admin';
import { createSupabaseService } from '@/lib/supabase/server';

/**
 * Hasil aksi admin LLM untuk feedback UI inline (lihat ActionFeedback).
 * Gagal auth/supabase tetap throw → error boundary (kasus luar biasa).
 * Gagal DB/validasi → { ok: false } agar UI tampilkan notice + rollback.
 */
export type LlmActionResult = { ok: true } | { ok: false; error: string };

function fail(message: string): LlmActionResult {
  return { ok: false, error: message };
}

async function requireAdmin() {
  if (!(await isAdmin())) throw new Error('Unauthorized: admin only');
  const supabase = createSupabaseService();
  if (!supabase) throw new Error('Supabase not configured');
  return supabase;
}

export async function updateProviderPriority(providerId: string, priority: number): Promise<LlmActionResult> {
  const supabase = await requireAdmin();
  const { error } = await supabase.from('llm_providers').update({ priority }).eq('id', providerId);
  if (error) return fail(error.message);
  revalidatePath('/admin/llm');
  return { ok: true };
}

export async function reorderProviders(orderedIds: string[]): Promise<LlmActionResult> {
  const supabase = await requireAdmin();
  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i]!;
    const priority = (i + 1) * 10;
    const { error } = await supabase.from('llm_providers').update({ priority }).eq('id', id);
    if (error) return fail(`reorderProviders ${id}: ${error.message}`);
  }
  revalidatePath('/admin/llm');
  return { ok: true };
}

export async function toggleProviderActive(providerId: string, isActive: boolean): Promise<LlmActionResult> {
  const supabase = await requireAdmin();
  const { error } = await supabase.from('llm_providers').update({ is_active: isActive }).eq('id', providerId);
  if (error) return fail(error.message);
  revalidatePath('/admin/llm');
  revalidatePath(`/admin/llm/${providerId}`);
  return { ok: true };
}

export async function updateProviderBaseUrl(providerId: string, formData: FormData): Promise<LlmActionResult> {
  const supabase = await requireAdmin();
  const baseUrl = String(formData.get('base_url') ?? '').trim();
  if (!baseUrl) return fail('base_url required');
  const { error } = await supabase.from('llm_providers').update({ base_url: baseUrl }).eq('id', providerId);
  if (error) return fail(error.message);
  revalidatePath('/admin/llm');
  revalidatePath(`/admin/llm/${providerId}`);
  return { ok: true };
}

export async function reorderModels(providerId: string, orderedIds: string[]): Promise<LlmActionResult> {
  const supabase = await requireAdmin();
  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i]!;
    const priority = (i + 1) * 10;
    const { error } = await supabase.from('llm_models').update({ priority }).eq('id', id);
    if (error) return fail(`reorderModels ${id}: ${error.message}`);
  }
  revalidatePath(`/admin/llm/${providerId}`);
  revalidatePath('/admin/llm');
  return { ok: true };
}

export async function toggleModelActive(modelId: string, providerId: string, isActive: boolean): Promise<LlmActionResult> {
  const supabase = await requireAdmin();
  const { error } = await supabase.from('llm_models').update({ is_active: isActive }).eq('id', modelId);
  if (error) return fail(error.message);
  revalidatePath(`/admin/llm/${providerId}`);
  return { ok: true };
}

export async function updateModelReasoning(modelId: string, providerId: string, reasoning: boolean): Promise<LlmActionResult> {
  const supabase = await requireAdmin();
  const { data: row } = await supabase.from('llm_models').select('config').eq('id', modelId).single();
  const current = ((row as { config?: Record<string, unknown> } | null)?.config ?? {}) as Record<string, unknown>;
  const next = { ...current, reasoning, reasoning_effort: reasoning ? 'max' : undefined };
  if (!reasoning) delete (next as Record<string, unknown>).reasoning_effort;
  const { error } = await supabase.from('llm_models').update({ config: next }).eq('id', modelId);
  if (error) return fail(error.message);
  revalidatePath(`/admin/llm/${providerId}`);
  return { ok: true };
}

const MODEL_EFFORTS = ['low', 'medium', 'high', 'max'] as const;
const THINKING_LEVELS = ['MINIMAL', 'LOW', 'MEDIUM', 'HIGH'] as const;

function parseOptionalNumber(raw: FormDataEntryValue | null, min: number, max: number, int: boolean): number | null | undefined {
  // undefined = field tak dikirim (jangan sentuh); null = kosong (hapus key); number = set.
  if (raw === null) return undefined;
  const s = String(raw).trim();
  if (s === '') return null;
  const v = Number(s);
  if (!Number.isFinite(v)) throw new Error(`nilai harus angka (dapat "${s}")`);
  if (v < min || v > max) throw new Error(`nilai harus ${min}–${max} (dapat ${s})`);
  return int ? Math.floor(v) : v;
}

/**
 * Update knob LLM per-model dari tabel (configurable by table).
 * Merge ke `config` jsonb — key lain dipertahankan. Nilai kosong menghapus key.
 */
export async function updateModelConfig(modelId: string, providerId: string, formData: FormData): Promise<LlmActionResult> {
  const supabase = await requireAdmin();
  try {
    const { data: row } = await supabase.from('llm_models').select('config').eq('id', modelId).single();
    const next = { ...(((row as { config?: Record<string, unknown> } | null)?.config ?? {})) } as Record<string, unknown>;

    const effort = String(formData.get('reasoning_effort') ?? '').trim();
    if (effort === 'off' || effort === '') {
      next.reasoning = false;
      delete next.reasoning_effort;
    } else if ((MODEL_EFFORTS as readonly string[]).includes(effort)) {
      next.reasoning = true;
      next.reasoning_effort = effort;
    } else {
      return fail('reasoning_effort tidak valid (off/low/medium/high/max)');
    }

    const budget = parseOptionalNumber(formData.get('thinking_budget'), 0, 32768, true);
    if (budget === null) delete next.thinking_budget;
    else if (budget !== undefined) next.thinking_budget = budget;

    const levelRaw = String(formData.get('thinking_level') ?? '').trim().toUpperCase();
    if (levelRaw === '') {
      delete next.thinking_level;
    } else if ((THINKING_LEVELS as readonly string[]).includes(levelRaw)) {
      next.thinking_level = levelRaw;
    } else {
      return fail('thinking_level tidak valid (MINIMAL/LOW/MEDIUM/HIGH)');
    }

    const temp = parseOptionalNumber(formData.get('temperature'), 0, 2, false);
    if (temp === null) delete next.temperature;
    else if (temp !== undefined) next.temperature = temp;

    const maxT = parseOptionalNumber(formData.get('max_tokens'), 1, 1000000, true);
    if (maxT === null) delete next.max_tokens;
    else if (maxT !== undefined) next.max_tokens = maxT;

    const { error } = await supabase.from('llm_models').update({ config: next }).eq('id', modelId);
    if (error) return fail(error.message);
    revalidatePath(`/admin/llm/${providerId}`);
    return { ok: true };
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Gagal menyimpan konfigurasi.');
  }
}

export async function addModel(providerId: string, formData: FormData): Promise<LlmActionResult> {
  const supabase = await requireAdmin();
  const modelIdRaw = String(formData.get('model_id') ?? '').trim();
  const displayName = String(formData.get('display_name') ?? '').trim() || modelIdRaw;
  const reasoning = formData.get('reasoning') === 'on';
  if (!modelIdRaw) return fail('model_id required');
  const { data: maxRow } = await supabase.from('llm_models').select('priority').eq('provider_id', providerId).order('priority', { ascending: false }).limit(1).maybeSingle();
  const nextPriority = (((maxRow as { priority?: number } | null)?.priority ?? 90) + 10);
  const { error } = await supabase.from('llm_models').insert({
    provider_id: providerId,
    model_id: modelIdRaw,
    display_name: displayName,
    is_default: false,
    priority: nextPriority,
    is_active: true,
    config: reasoning ? { reasoning: true, reasoning_effort: 'max' } : { reasoning: false }
  } as never);
  if (error) return fail(error.message);
  revalidatePath(`/admin/llm/${providerId}`);
  return { ok: true };
}

export async function reorderKeys(providerId: string, orderedIds: string[]): Promise<LlmActionResult> {
  const supabase = await requireAdmin();
  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i]!;
    const priority = i;
    const { error } = await supabase.from('llm_provider_keys').update({ priority }).eq('id', id);
    if (error) return fail(`reorderKeys ${id}: ${error.message}`);
  }
  revalidatePath(`/admin/llm/${providerId}`);
  return { ok: true };
}

export async function toggleKeyActive(keyId: string, providerId: string, isActive: boolean): Promise<LlmActionResult> {
  const supabase = await requireAdmin();
  const patch: Record<string, unknown> = { is_active: isActive };
  if (isActive) patch.failure_count = 0;
  const { error } = await supabase.from('llm_provider_keys').update(patch).eq('id', keyId);
  if (error) return fail(error.message);
  revalidatePath(`/admin/llm/${providerId}`);
  return { ok: true };
}

export async function addBackupKey(providerId: string, formData: FormData): Promise<LlmActionResult> {
  const supabase = await requireAdmin();
  const rawKey = String(formData.get('api_key') ?? '').trim();
  if (!rawKey || rawKey.length < 10) return fail('API key terlalu pendek');
  const { data: maxRow } = await supabase.from('llm_provider_keys').select('priority').eq('provider_id', providerId).order('priority', { ascending: false }).limit(1).maybeSingle();
  const nextPriority = (((maxRow as { priority?: number } | null)?.priority ?? -1) + 1);
  const hash = createHash('sha256').update(rawKey).digest('hex').slice(0, 16);
  const { data: provider } = await supabase.from('llm_providers').select('slug').eq('id', providerId).single();
  const slug = (provider as { slug?: string } | null)?.slug ?? 'unknown';
  const { data: vaultId, error: vaultError } = await supabase.rpc('vault_create_secret', { p_secret: rawKey, p_name: `llm_${slug}_${hash}` });
  if (vaultError) return fail(`vault_create_secret: ${vaultError.message}`);
  const { error } = await supabase.from('llm_provider_keys').upsert({
    provider_id: providerId,
    vault_secret_id: vaultId as string,
    key_hash: hash,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api_key_encrypted: null as any,
    priority: nextPriority,
    is_active: true
  } as never, { onConflict: 'key_hash' });
  if (error) {
    try { await supabase.rpc('vault_delete_secret', { p_id: vaultId }); } catch { /* ignore */ }
    return fail(error.message);
  }
  revalidatePath(`/admin/llm/${providerId}`);
  return { ok: true };
}

export async function replaceKey(keyId: string, providerId: string, formData: FormData): Promise<LlmActionResult> {
  const supabase = await requireAdmin();
  const rawKey = String(formData.get('api_key') ?? '').trim();
  if (!rawKey || rawKey.length < 10) return fail('API key terlalu pendek');
  const { data: existing } = await supabase.from('llm_provider_keys').select('vault_secret_id, provider_id').eq('id', keyId).single();
  const oldVaultId = (existing as { vault_secret_id?: string | null } | null)?.vault_secret_id ?? null;
  const { data: provider } = await supabase.from('llm_providers').select('slug').eq('id', providerId).single();
  const slug = (provider as { slug?: string } | null)?.slug ?? 'unknown';
  const hash = createHash('sha256').update(rawKey).digest('hex').slice(0, 16);
  const { data: vaultId, error: vaultError } = await supabase.rpc('vault_create_secret', { p_secret: rawKey, p_name: `llm_${slug}_${hash}` });
  if (vaultError) return fail(`vault_create_secret: ${vaultError.message}`);
  const { error } = await supabase.from('llm_provider_keys').update({
    vault_secret_id: vaultId as string,
    key_hash: hash,
    api_key_encrypted: null,
    failure_count: 0,
    is_active: true
  } as unknown as Record<string, unknown>).eq('id', keyId);
  if (error) {
    try { await supabase.rpc('vault_delete_secret', { p_id: vaultId }); } catch { /* ignore */ }
    return fail(error.message);
  }
  if (oldVaultId) {
    try { await supabase.rpc('vault_delete_secret', { p_id: oldVaultId }); } catch { /* ignore */ }
  }
  revalidatePath(`/admin/llm/${providerId}`);
  return { ok: true };
}

export async function upsertStageDefault(formData: FormData): Promise<LlmActionResult> {
  const supabase = await requireAdmin();
  const stage = String(formData.get('stage') ?? '').trim();
  const modelId = String(formData.get('model_id') ?? '').trim();
  const valid = ['idea_generation', 'discovering', 'verifying', 'scoring', 'developing', 'regen_affiliate', 'image_prompt', 'enhance_image_prompt'];
  if (!valid.includes(stage)) return fail('stage tidak valid');
  const { data: { user } } = await supabase.auth.getUser();
  if (!modelId) {
    const { error } = await supabase.from('llm_stage_defaults').update({ provider_id: null, model_id: null, updated_by: user?.id ?? null, updated_at: new Date().toISOString() }).eq('stage', stage);
    if (error) return fail(error.message);
  } else {
    const { data: m } = await supabase.from('llm_models').select('id, provider_id, is_active').eq('id', modelId).maybeSingle();
    const mr = m as { id: string; provider_id: string; is_active: boolean } | null;
    if (!mr || !mr.is_active) return fail('Model tidak valid atau nonaktif');
    const { error } = await supabase.from('llm_stage_defaults').update({ provider_id: mr.provider_id, model_id: mr.id, updated_by: user?.id ?? null, updated_at: new Date().toISOString() }).eq('stage', stage);
    if (error) return fail(error.message);
  }
  revalidatePath('/admin/llm');
  revalidatePath('/admin/llm/stages');
  revalidatePath('/konten/baru');
  return { ok: true };
}
