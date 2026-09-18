'use server';

import { revalidatePath } from 'next/cache';
import { isAdmin } from '@/lib/auth/is-admin';
import { createSupabaseService } from '@/lib/supabase/server';
import { revalidateAffiliateCatalog } from '@/lib/affiliate/revalidate';
import { planFeaturedOverride, type OverrideMode } from './featured-plan';

/**
 * Hasil aksi admin featured:
 *   - ok:true + released (optional) = produk yang dilepas saat auto-swap penuh.
 *   - ok:false + error = validasi/gagal DB; UI tampilkan notice error.
 */
export type AffiliateActionResult =
  | { ok: true; released?: string }
  | { ok: false; error: string };

async function requireAdmin() {
  if (!(await isAdmin())) throw new Error('Unauthorized: admin only');
  const supabase = createSupabaseService();
  if (!supabase) throw new Error('Supabase not configured');
  return supabase;
}

function fail(message: string): AffiliateActionResult {
  return { ok: false, error: message };
}

interface TargetRow {
  id: string;
  friendly_code: string;
  name_id: string;
  featured_override: boolean | null;
  featured_override_at: string | null;
}

interface PinnedRow {
  id: string;
  friendly_code: string;
  featured_override: boolean | null;
  featured_override_at: string | null;
}

/**
 * Toggle featured state produk. Mode:
 * - 'pin'    : paksa featured (rank 0); swap bila slot penuh.
 * - 'auto'   : kembali ke default scraper (rank 1 bila is_featured).
 * - 'exclude': paksa non-featured (rank 2); tidak swap.
 */
export async function setProductFeatured(
  productId: string,
  mode: OverrideMode
): Promise<AffiliateActionResult> {
  const supabase = await requireAdmin();

  if (!productId) return fail('productId required');
  if (!['pin', 'auto', 'exclude'].includes(mode)) return fail('mode must be pin|auto|exclude');

  // Ambil baris target.
  const { data: targetData, error: targetError } = await supabase
    .from('affiliate_products')
    .select('id, friendly_code, name_id, featured_override, featured_override_at')
    .eq('id', productId)
    .maybeSingle();
  if (targetError) return fail(targetError.message);
  const target = targetData as TargetRow | null;
  if (!target) return fail('Produk tidak ditemukan');

  // Ambil pinned lain (order ASC NULLS FIRST → oldest at muncul duluan; tie-break id).
  const { data: pinnedData, error: pinnedError } = await supabase
    .from('affiliate_products')
    .select('id, friendly_code, featured_override_at')
    .neq('id', productId)
    .eq('featured_override', true)
    .order('featured_override_at', { ascending: true, nullsFirst: true })
    .order('id', { ascending: true })
    .limit(7);
  if (pinnedError) return fail(pinnedError.message);
  const pinned = (pinnedData ?? []) as PinnedRow[];

  const now = new Date().toISOString();
  const plan = planFeaturedOverride(pinned, target.id, mode, now);

  // Apply release first (jika ada) agar ID unik terjaga.
  if (plan.release) {
    const { error: releaseError } = await supabase
      .from('affiliate_products')
      .update({ featured_override: null, featured_override_at: null })
      .eq('id', plan.release.id);
    if (releaseError) return fail(releaseError.message);
  }

  // Apply target.
  const updatePayload = {
    featured_override: plan.setTarget.override,
    featured_override_at: plan.setTarget.at
  } as Record<string, unknown>;
  const { error: updateError } = await supabase
    .from('affiliate_products')
    .update(updatePayload)
    .eq('id', target.id);
  if (updateError) {
    // Rollback release bila target gagal (best-effort — tidak perlu strict rollback).
    try {
      if (plan.release) {
        await supabase
          .from('affiliate_products')
          .update({ featured_override: true, featured_override_at: pinned.find((r) => r.id === plan.release!.id)?.featured_override_at ?? null })
          .eq('id', plan.release.id);
      }
    } catch {
      // ignore rollback errors; original state partially recovered via DB.
    }
    return fail(updateError.message);
  }

  revalidateAffiliateCatalog();
  revalidatePath('/admin/produk');
  return { ok: true, released: plan.release?.friendly_code };
}
