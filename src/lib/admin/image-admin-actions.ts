'use server';

import { revalidatePath } from 'next/cache';
import { createHash } from 'node:crypto';
import { isAdmin } from '@/lib/auth/is-admin';
import { createSupabaseService } from '@/lib/supabase/server';
import type { LlmActionResult } from './llm-actions';

/**
 * Aksi admin provider/model/key IMAGE generation (cermin llm-actions).
 * Hasil untuk feedback inline; gagal auth tetap throw.
 */

function fail(message: string): LlmActionResult {
  return { ok: false, error: message };
}

async function requireAdmin() {
  if (!(await isAdmin())) throw new Error('Unauthorized: admin only');
  const supabase = createSupabaseService();
  if (!supabase) throw new Error('Supabase not configured');
  return supabase;
}

function validAccountId(v: string): boolean {
  return /^[0-9a-f]{32}$/i.test(v);
}

// --- Providers ---

export async function reorderImageProviders(orderedIds: string[]): Promise<LlmActionResult> {
  const supabase = await requireAdmin();
  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i]!;
    const priority = (i + 1) * 10;
    const { error } = await supabase.from('image_providers').update({ priority }).eq('id', id);
    if (error) return fail(`reorderImageProviders ${id}: ${error.message}`);
  }
  revalidatePath('/admin/visual');
  return { ok: true };
}

export async function toggleImageProviderActive(providerId: string, isActive: boolean): Promise<LlmActionResult> {
  const supabase = await requireAdmin();
  const { error } = await supabase.from('image_providers').update({ is_active: isActive }).eq('id', providerId);
  if (error) return fail(error.message);
  revalidatePath('/admin/visual');
  return { ok: true };
}

/** Merge config.provider (base_url / account_id) tanpa menimpa key config lain. */
async function mergeImageProviderConfig(providerId: string, patch: Record<string, string>): Promise<LlmActionResult> {
  const supabase = await requireAdmin();
  const { data: row } = await supabase.from('image_providers').select('config').eq('id', providerId).single();
  const current = ((row as { config?: Record<string, string> } | null)?.config ?? {}) as Record<string, string>;
  const { error } = await supabase
    .from('image_providers')
    .update({ config: { ...current, ...patch } })
    .eq('id', providerId);
  if (error) return fail(error.message);
  revalidatePath('/admin/visual');
  return { ok: true };
}

export async function updateImageProviderBaseUrl(providerId: string, formData: FormData): Promise<LlmActionResult> {
  const baseUrl = String(formData.get('base_url') ?? '').trim();
  if (!baseUrl) return fail('base_url required');
  return mergeImageProviderConfig(providerId, { base_url: baseUrl });
}

export async function updateImageProviderAccountId(providerId: string, formData: FormData): Promise<LlmActionResult> {
  const accountId = String(formData.get('account_id') ?? '').trim();
  if (!accountId) return fail('account_id required');
  if (!validAccountId(accountId)) return fail('account_id harus 32 hex char');
  return mergeImageProviderConfig(providerId, { account_id: accountId });
}

// --- Models ---

export async function reorderImageModels(providerId: string, orderedIds: string[]): Promise<LlmActionResult> {
  const supabase = await requireAdmin();
  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i]!;
    const priority = (i + 1) * 10;
    const { error } = await supabase.from('image_models').update({ priority }).eq('id', id);
    if (error) return fail(`reorderImageModels ${id}: ${error.message}`);
  }
  revalidatePath('/admin/visual');
  return { ok: true };
}

export async function toggleImageModelActive(modelId: string, isActive: boolean): Promise<LlmActionResult> {
  const supabase = await requireAdmin();
  const { error } = await supabase.from('image_models').update({ is_active: isActive }).eq('id', modelId);
  if (error) return fail(error.message);
  revalidatePath('/admin/visual');
  return { ok: true };
}

export async function addImageModel(providerId: string, formData: FormData): Promise<LlmActionResult> {
  const supabase = await requireAdmin();
  const modelIdRaw = String(formData.get('model_id') ?? '').trim();
  const displayName = String(formData.get('display_name') ?? '').trim() || modelIdRaw;
  if (!modelIdRaw) return fail('model_id required');
  const { data: maxRow } = await supabase.from('image_models').select('priority').eq('provider_id', providerId).order('priority', { ascending: false }).limit(1).maybeSingle();
  const nextPriority = (((maxRow as { priority?: number } | null)?.priority ?? 90) + 10);
  const { error } = await supabase.from('image_models').insert({
    provider_id: providerId,
    model_id: modelIdRaw,
    display_name: displayName,
    is_default: false,
    priority: nextPriority,
    is_active: true,
    config: {}
  } as never);
  if (error) return fail(error.message);
  revalidatePath('/admin/visual');
  return { ok: true };
}

// --- Keys (Vault by-name + suffix audit, meniru seed) ---

export async function reorderImageKeys(orderedIds: string[]): Promise<LlmActionResult> {
  const supabase = await requireAdmin();
  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i]!;
    const priority = (i + 1) * 10;
    const { error } = await supabase.from('image_provider_keys').update({ priority }).eq('id', id);
    if (error) return fail(`reorderImageKeys ${id}: ${error.message}`);
  }
  revalidatePath('/admin/visual');
  return { ok: true };
}

export async function toggleImageKeyActive(keyId: string, isActive: boolean): Promise<LlmActionResult> {
  const supabase = await requireAdmin();
  const patch: Record<string, unknown> = { is_active: isActive };
  if (isActive) patch.failure_count = 0;
  const { error } = await supabase.from('image_provider_keys').update(patch).eq('id', keyId);
  if (error) return fail(error.message);
  revalidatePath('/admin/visual');
  return { ok: true };
}

export async function addImageBackupKey(providerId: string, formData: FormData): Promise<LlmActionResult> {
  const supabase = await requireAdmin();
  const rawKey = String(formData.get('api_key') ?? '').trim();
  if (!rawKey || rawKey.length < 10) return fail('API key terlalu pendek');
  const label = String(formData.get('label') ?? '').trim() || 'backup';
  const { data: provider } = await supabase.from('image_providers').select('slug, config').eq('id', providerId).single();
  const slug = (provider as { slug?: string } | null)?.slug ?? 'unknown';
  // Pair cloudflare: account_id ikut disimpan (identifier, bukan secret).
  const accountId = String(formData.get('account_id') ?? '').trim();
  if (slug === 'cloudflare' && accountId) {
    if (!validAccountId(accountId)) return fail('account_id harus 32 hex char');
    const current = ((provider as { config?: Record<string, string> } | null)?.config ?? {}) as Record<string, string>;
    const { error: cfgError } = await supabase
      .from('image_providers')
      .update({ config: { ...current, account_id: accountId } })
      .eq('id', providerId);
    if (cfgError) return fail(cfgError.message);
  }
  const hash = createHash('sha256').update(rawKey).digest('hex').slice(0, 16);
  const secretName = `img_${slug}_${hash}`;
  const { data: vaultId, error: vaultError } = await supabase.rpc('vault_create_secret', { p_secret: rawKey, p_name: secretName });
  if (vaultError) return fail(`vault_create_secret: ${vaultError.message}`);
  const { data: maxRow } = await supabase.from('image_provider_keys').select('priority').eq('provider_id', providerId).order('priority', { ascending: false }).limit(1).maybeSingle();
  const nextPriority = (((maxRow as { priority?: number } | null)?.priority ?? 0) + 10);
  const { error } = await supabase.from('image_provider_keys').insert({
    provider_id: providerId,
    vault_secret_id: vaultId as string,
    vault_secret_name: secretName,
    key_hash: hash,
    key_suffix: rawKey.slice(-4),
    label,
    priority: nextPriority,
    is_active: true
  } as never);
  if (error) {
    try { await supabase.rpc('vault_delete_secret', { p_id: vaultId }); } catch { /* ignore */ }
    return fail(error.message);
  }
  revalidatePath('/admin/visual');
  return { ok: true };
}

export async function replaceImageKey(keyId: string, formData: FormData): Promise<LlmActionResult> {
  const supabase = await requireAdmin();
  const rawKey = String(formData.get('api_key') ?? '').trim();
  if (!rawKey || rawKey.length < 10) return fail('API key terlalu pendek');
  const { data: existing } = await supabase.from('image_provider_keys').select('vault_secret_id, provider_id').eq('id', keyId).single();
  const oldVaultId = (existing as { vault_secret_id?: string | null } | null)?.vault_secret_id ?? null;
  const providerId = (existing as { provider_id?: string } | null)?.provider_id ?? null;
  const { data: provider } = providerId
    ? await supabase.from('image_providers').select('slug').eq('id', providerId).single()
    : { data: null };
  const slug = (provider as { slug?: string } | null)?.slug ?? 'unknown';
  const hash = createHash('sha256').update(rawKey).digest('hex').slice(0, 16);
  const secretName = `img_${slug}_${hash}`;
  const { data: vaultId, error: vaultError } = await supabase.rpc('vault_create_secret', { p_secret: rawKey, p_name: secretName });
  if (vaultError) return fail(`vault_create_secret: ${vaultError.message}`);
  const { error } = await supabase.from('image_provider_keys').update({
    vault_secret_id: vaultId as string,
    vault_secret_name: secretName,
    key_hash: hash,
    key_suffix: rawKey.slice(-4),
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
  revalidatePath('/admin/visual');
  return { ok: true };
}
