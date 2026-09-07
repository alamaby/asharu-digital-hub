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
 * Enqueue generate cover (post 0, auto prompt via LLM) atau regenerate dengan
 * override manual. Worker cron memproses antrean; tidak blocking.
 */
export async function generateDraftImage(
  draftId: string,
  override?: { modelUuid?: string | null; styleSlug?: string | null }
): Promise<{ imageId: string }> {
  return generatePostImage(draftId, 0, override);
}

/**
 * Enqueue generate untuk 1 reply (post_index ≥ 1). Opt-in manual dari review;
 * reply afiliasi ditolak (tetap pakai gambar produk). Mode global/sesi/draf
 * `per-reply-opt-in` wajib aktif kecuali untuk cover (post 0).
 */
export async function generatePostImage(
  draftId: string,
  postIndex: number,
  override?: { modelUuid?: string | null; styleSlug?: string | null }
): Promise<{ imageId: string }> {
  const supabase = await requireAdmin();
  if (!draftId) throw new Error('draftId required');
  if (!Number.isInteger(postIndex) || postIndex < 0) throw new Error('postIndex must be >= 0');
  const { data: draft } = await supabase
    .from('content_drafts')
    .select('id, generated_thread, affiliate_injections, image_mode, research_topic_id')
    .eq('id', draftId)
    .maybeSingle();
  if (!draft) throw new Error('draft not found');
  const d = draft as {
    generated_thread: { main: { id: string; en: string }; replies: { id: string; en: string }[] };
    affiliate_injections: { post_index: number }[];
    image_mode: string | null;
    research_topic_id: string | null;
  };
  const posts = [d.generated_thread.main, ...d.generated_thread.replies];
  if (!posts[postIndex]) throw new Error(`post ${postIndex} not found`);
  const affiliateIdx = d.affiliate_injections?.[0]?.post_index;
  if (postIndex > 0 && affiliateIdx === postIndex) {
    throw new Error('reply afiliasi memakai gambar produk — generate ditolak');
  }
  if (postIndex > 0 && !(await isPerReplyEnabled(d))) {
    throw new Error('mode per-reply belum aktif (image_gen_defaults / sesi / draf)');
  }
  const { data: created, error } = await supabase
    .from('content_draft_images')
    .insert({
      draft_id: draftId,
      post_index: postIndex,
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

async function isPerReplyEnabled(d: { image_mode: string | null; research_topic_id: string | null }): Promise<boolean> {
  if (d.image_mode === 'per-reply-opt-in') return true;
  if (d.image_mode === 'cover-only') return false;
  const supabase = createSupabaseService();
  if (!supabase || !d.research_topic_id) {
    const { data } = await supabase
      ?.from('image_gen_defaults')
      .select('image_mode')
      .eq('id', 1)
      .maybeSingle() ?? { data: null };
    return (data as { image_mode: string } | null)?.image_mode === 'per-reply-opt-in';
  }
  const { data: topic } = await supabase
    .from('content_research_topics')
    .select('session_id')
    .eq('id', d.research_topic_id)
    .maybeSingle();
  const sessionId = (topic as { session_id: string } | null)?.session_id;
  if (sessionId) {
    const { data: session } = await supabase
      .from('content_research_sessions')
      .select('image_mode')
      .eq('id', sessionId)
      .maybeSingle();
    const mode = (session as { image_mode: string | null } | null)?.image_mode;
    if (mode) return mode === 'per-reply-opt-in';
  }
  const { data } = await supabase.from('image_gen_defaults').select('image_mode').eq('id', 1).maybeSingle();
  return (data as { image_mode: string } | null)?.image_mode === 'per-reply-opt-in';
}

/** Pilih 1 image sebagai selected untuk post itu (cover = post 0 untuk social). */
export async function selectDraftImage(draftId: string, imageId: string): Promise<void> {
  const supabase = await requireAdmin();
  const { data: row } = await supabase
    .from('content_draft_images')
    .select('id, draft_id, post_index, status')
    .eq('id', imageId)
    .eq('draft_id', draftId)
    .maybeSingle();
  if (!row) throw new Error('image not found for draft');
  const r = row as { post_index: number; status: string };
  if (r.status !== 'ready' && r.status !== 'selected') {
    throw new Error('only ready images can be selected');
  }
  await supabase
    .from('content_draft_images')
    .update({ status: 'ready', updated_at: new Date().toISOString() })
    .eq('draft_id', draftId)
    .eq('post_index', r.post_index)
    .eq('status', 'selected');
  const { error } = await supabase
    .from('content_draft_images')
    .update({ status: 'selected', updated_at: new Date().toISOString() })
    .eq('id', imageId);
  if (error) throw new Error(error.message);
  if (r.post_index === 0) {
    await supabase.from('content_drafts').update({ selected_image_id: imageId }).eq('id', draftId);
    // Teruskan ke antrean social yang masih queued (aditif, upsert kolom saja).
    await supabase
      .from('social_post_queue')
      .update({ image_url: (await selectedPublicUrl(imageId)) ?? null })
      .eq('draft_id', draftId)
      .eq('status', 'queued');
  } else {
    await syncQueueImageUrls(draftId);
  }
  revalidatePath('/konten/review');
  revalidatePath('/konten/review/[draftId]', 'page');
}

/** Sinkronkan peta image per index ke antrean queued (kolom image_urls jsonb). */
async function syncQueueImageUrls(draftId: string): Promise<void> {
  const supabase = createSupabaseService();
  if (!supabase) return;
  const { data } = await supabase
    .from('content_draft_images')
    .select('post_index, public_url')
    .eq('draft_id', draftId)
    .eq('status', 'selected');
  const map: Record<string, string> = {};
  for (const r of ((data ?? []) as { post_index: number; public_url: string | null }[])) {
    if (r.public_url) map[String(r.post_index)] = r.public_url;
  }
  if (Object.keys(map).length === 0) return;
  await supabase
    .from('social_post_queue')
    .update({ image_urls: map })
    .eq('draft_id', draftId)
    .eq('status', 'queued');
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
