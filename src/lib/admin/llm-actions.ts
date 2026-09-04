'use server';

import { revalidatePath } from 'next/cache';
import { createHash } from 'node:crypto';
import { isAdmin } from '@/lib/auth/is-admin';
import { createSupabaseService } from '@/lib/supabase/server';

async function requireAdmin() {
  if (!(await isAdmin())) throw new Error('Unauthorized: admin only');
  const supabase = createSupabaseService();
  if (!supabase) throw new Error('Supabase not configured');
  return supabase;
}

export async function updateProviderPriority(providerId: string, priority: number) {
  const supabase = await requireAdmin();
  const { error } = await supabase.from('llm_providers').update({ priority }).eq('id', providerId);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/llm');
}

export async function reorderProviders(orderedIds: string[]) {
  const supabase = await requireAdmin();
  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i]!;
    const priority = (i + 1) * 10;
    const { error } = await supabase.from('llm_providers').update({ priority }).eq('id', id);
    if (error) throw new Error(`reorderProviders ${id}: ${error.message}`);
  }
  revalidatePath('/admin/llm');
}

export async function toggleProviderActive(providerId: string, isActive: boolean) {
  const supabase = await requireAdmin();
  const { error } = await supabase.from('llm_providers').update({ is_active: isActive }).eq('id', providerId);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/llm');
  revalidatePath(`/admin/llm/${providerId}`);
}

export async function updateProviderBaseUrl(providerId: string, formData: FormData) {
  const supabase = await requireAdmin();
  const baseUrl = String(formData.get('base_url') ?? '').trim();
  if (!baseUrl) throw new Error('base_url required');
  const { error } = await supabase.from('llm_providers').update({ base_url: baseUrl }).eq('id', providerId);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/llm');
  revalidatePath(`/admin/llm/${providerId}`);
}

export async function reorderModels(providerId: string, orderedIds: string[]) {
  const supabase = await requireAdmin();
  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i]!;
    const priority = (i + 1) * 10;
    const { error } = await supabase.from('llm_models').update({ priority }).eq('id', id);
    if (error) throw new Error(`reorderModels ${id}: ${error.message}`);
  }
  revalidatePath(`/admin/llm/${providerId}`);
  revalidatePath('/admin/llm');
}

export async function toggleModelActive(modelId: string, providerId: string, isActive: boolean) {
  const supabase = await requireAdmin();
  const { error } = await supabase.from('llm_models').update({ is_active: isActive }).eq('id', modelId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/llm/${providerId}`);
}

export async function updateModelReasoning(modelId: string, providerId: string, reasoning: boolean) {
  const supabase = await requireAdmin();
  const { data: row } = await supabase.from('llm_models').select('config').eq('id', modelId).single();
  const current = ((row as { config?: Record<string, unknown> } | null)?.config ?? {}) as Record<string, unknown>;
  const next = { ...current, reasoning, reasoning_effort: reasoning ? 'max' : undefined };
  if (!reasoning) delete (next as Record<string, unknown>).reasoning_effort;
  const { error } = await supabase.from('llm_models').update({ config: next }).eq('id', modelId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/llm/${providerId}`);
}

export async function addModel(providerId: string, formData: FormData) {
  const supabase = await requireAdmin();
  const modelIdRaw = String(formData.get('model_id') ?? '').trim();
  const displayName = String(formData.get('display_name') ?? '').trim() || modelIdRaw;
  const reasoning = formData.get('reasoning') === 'on';
  if (!modelIdRaw) throw new Error('model_id required');
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
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/llm/${providerId}`);
}

export async function reorderKeys(providerId: string, orderedIds: string[]) {
  const supabase = await requireAdmin();
  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i]!;
    const priority = i;
    const { error } = await supabase.from('llm_provider_keys').update({ priority }).eq('id', id);
    if (error) throw new Error(`reorderKeys ${id}: ${error.message}`);
  }
  revalidatePath(`/admin/llm/${providerId}`);
}

export async function toggleKeyActive(keyId: string, providerId: string, isActive: boolean) {
  const supabase = await requireAdmin();
  const patch: Record<string, unknown> = { is_active: isActive };
  if (isActive) patch.failure_count = 0;
  const { error } = await supabase.from('llm_provider_keys').update(patch).eq('id', keyId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/llm/${providerId}`);
}

export async function addBackupKey(providerId: string, formData: FormData) {
  const supabase = await requireAdmin();
  const rawKey = String(formData.get('api_key') ?? '').trim();
  if (!rawKey || rawKey.length < 10) throw new Error('API key terlalu pendek');
  const { data: maxRow } = await supabase.from('llm_provider_keys').select('priority').eq('provider_id', providerId).order('priority', { ascending: false }).limit(1).maybeSingle();
  const nextPriority = (((maxRow as { priority?: number } | null)?.priority ?? -1) + 1);
  const hash = createHash('sha256').update(rawKey).digest('hex').slice(0, 16);
  const { data: provider } = await supabase.from('llm_providers').select('slug').eq('id', providerId).single();
  const slug = (provider as { slug?: string } | null)?.slug ?? 'unknown';
  const { data: vaultId, error: vaultError } = await supabase.rpc('vault_create_secret', { p_secret: rawKey, p_name: `llm_${slug}_${hash}` });
  if (vaultError) throw new Error(`vault_create_secret: ${vaultError.message}`);
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
    throw new Error(error.message);
  }
  revalidatePath(`/admin/llm/${providerId}`);
}

export async function replaceKey(keyId: string, providerId: string, formData: FormData) {
  const supabase = await requireAdmin();
  const rawKey = String(formData.get('api_key') ?? '').trim();
  if (!rawKey || rawKey.length < 10) throw new Error('API key terlalu pendek');
  const { data: existing } = await supabase.from('llm_provider_keys').select('vault_secret_id, provider_id').eq('id', keyId).single();
  const oldVaultId = (existing as { vault_secret_id?: string | null } | null)?.vault_secret_id ?? null;
  const { data: provider } = await supabase.from('llm_providers').select('slug').eq('id', providerId).single();
  const slug = (provider as { slug?: string } | null)?.slug ?? 'unknown';
  const hash = createHash('sha256').update(rawKey).digest('hex').slice(0, 16);
  const { data: vaultId, error: vaultError } = await supabase.rpc('vault_create_secret', { p_secret: rawKey, p_name: `llm_${slug}_${hash}` });
  if (vaultError) throw new Error(`vault_create_secret: ${vaultError.message}`);
  const { error } = await supabase.from('llm_provider_keys').update({
    vault_secret_id: vaultId as string,
    key_hash: hash,
    api_key_encrypted: null,
    failure_count: 0,
    is_active: true
  } as unknown as Record<string, unknown>).eq('id', keyId);
  if (error) {
    try { await supabase.rpc('vault_delete_secret', { p_id: vaultId }); } catch { /* ignore */ }
    throw new Error(error.message);
  }
  if (oldVaultId) {
    try { await supabase.rpc('vault_delete_secret', { p_id: oldVaultId }); } catch { /* ignore */ }
  }
  revalidatePath(`/admin/llm/${providerId}`);
}

export async function upsertStageDefault(formData: FormData) {
  const supabase = await requireAdmin();
  const stage = String(formData.get('stage') ?? '').trim();
  const modelId = String(formData.get('model_id') ?? '').trim();
  const valid = ['idea_generation', 'discovering', 'verifying', 'scoring', 'developing', 'regen_affiliate'];
  if (!valid.includes(stage)) throw new Error('stage tidak valid');
  const { data: { user } } = await supabase.auth.getUser();
  if (!modelId) {
    const { error } = await supabase.from('llm_stage_defaults').update({ provider_id: null, model_id: null, updated_by: user?.id ?? null, updated_at: new Date().toISOString() }).eq('stage', stage);
    if (error) throw new Error(error.message);
  } else {
    const { data: m } = await supabase.from('llm_models').select('id, provider_id, is_active').eq('id', modelId).maybeSingle();
    const mr = m as { id: string; provider_id: string; is_active: boolean } | null;
    if (!mr || !mr.is_active) throw new Error('Model tidak valid atau nonaktif');
    const { error } = await supabase.from('llm_stage_defaults').update({ provider_id: mr.provider_id, model_id: mr.id, updated_by: user?.id ?? null, updated_at: new Date().toISOString() }).eq('stage', stage);
    if (error) throw new Error(error.message);
  }
  revalidatePath('/admin/llm');
  revalidatePath('/admin/llm/stages');
  revalidatePath('/konten/baru');
}
