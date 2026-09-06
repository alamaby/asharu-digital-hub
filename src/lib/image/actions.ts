'use server';

import { revalidatePath } from 'next/cache';
import { isAdmin } from '@/lib/auth/is-admin';
import { createSupabaseService } from '@/lib/supabase/server';
import type { DraftImageRow } from './types';

async function requireAdmin() {
  if (!(await isAdmin())) throw new Error('Unauthorized: admin only');
  const supabase = createSupabaseService();
  if (!supabase) throw new Error('Supabase not configured');
  return supabase;
}

/** Ambil history image 1 draf (terbaru dulu) + selected. */
export async function listDraftImages(draftId: string): Promise<DraftImageRow[]> {
  const supabase = await requireAdmin();
  const { data, error } = await supabase
    .from('content_draft_images')
    .select('*')
    .eq('draft_id', draftId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as DraftImageRow[];
}

/**
 * Enqueue generate (auto prompt via LLM) atau regenerate dengan override manual.
 * Worker cron memproses antrean; tidak blocking.
 */
export async function generateDraftImage(
  draftId: string,
  override?: { modelUuid?: string | null; styleSlug?: string | null }
): Promise<{ imageId: string }> {
  const supabase = await requireAdmin();
  if (!draftId) throw new Error('draftId required');
  const { data: draft } = await supabase.from('content_drafts').select('id').eq('id', draftId).maybeSingle();
  if (!draft) throw new Error('draft not found');
  const { data: created, error } = await supabase
    .from('content_draft_images')
    .insert({
      draft_id: draftId,
      image_prompt: '',
      provider_slug: '',
      model_id: '',
      llm_meta: override ? { override } : {}
    })
    .select('id')
    .single();
  if (error || !created) throw new Error(error?.message ?? 'enqueue failed');
  revalidatePath('/konten/review');
  revalidatePath('/konten/review/[draftId]', 'page');
  return { imageId: (created as { id: string }).id };
}

/** Pilih 1 image sebagai cover (lampiran review + social). */
export async function selectDraftImage(draftId: string, imageId: string): Promise<void> {
  const supabase = await requireAdmin();
  const { data: row } = await supabase
    .from('content_draft_images')
    .select('id, draft_id, status')
    .eq('id', imageId)
    .eq('draft_id', draftId)
    .maybeSingle();
  if (!row) throw new Error('image not found for draft');
  if ((row as { status: string }).status !== 'ready' && (row as { status: string }).status !== 'selected') {
    throw new Error('only ready images can be selected');
  }
  await supabase
    .from('content_draft_images')
    .update({ status: 'ready', updated_at: new Date().toISOString() })
    .eq('draft_id', draftId)
    .eq('status', 'selected');
  const { error } = await supabase
    .from('content_draft_images')
    .update({ status: 'selected', updated_at: new Date().toISOString() })
    .eq('id', imageId);
  if (error) throw new Error(error.message);
  await supabase.from('content_drafts').update({ selected_image_id: imageId }).eq('id', draftId);
  // Teruskan ke antrean social yang masih queued (aditif, upsert kolom saja).
  await supabase
    .from('social_post_queue')
    .update({ image_url: (await selectedPublicUrl(imageId)) ?? null })
    .eq('draft_id', draftId)
    .eq('status', 'queued');
  revalidatePath('/konten/review');
  revalidatePath('/konten/review/[draftId]', 'page');
}

async function selectedPublicUrl(imageId: string): Promise<string | null> {
  const supabase = createSupabaseService();
  if (!supabase) return null;
  const { data } = await supabase
    .from('content_draft_images')
    .select('public_url')
    .eq('id', imageId)
    .maybeSingle();
  return ((data as { public_url: string | null } | null)?.public_url ?? null) || null;
}
