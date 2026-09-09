/** Katalog template riset — slug enum sisi kode, isi hint di DB (`research_templates`). */
import type { SupabaseClient } from '@supabase/supabase-js';

export const RESEARCH_TEMPLATE_SLUGS = [
  'problem-solution',
  'before-after',
  'product-comparison',
  'top-product-list',
  'product-education',
  'promotion-urgency'
] as const;

export type ResearchTemplateSlug = (typeof RESEARCH_TEMPLATE_SLUGS)[number];

export interface ResearchTemplateHint {
  slug: string;
  display_name: string;
  description: string;
  discovery_hint: string;
  development_hint: string;
}

/** Ambil hint template aktif dari DB; null bila slug kosong / tidak aktif. */
export async function getResearchTemplateHint(
  supabase: SupabaseClient,
  slug: string | null | undefined
): Promise<ResearchTemplateHint | null> {
  if (!slug) return null;
  const { data } = await supabase
    .from('research_templates')
    .select('slug, display_name, description, discovery_hint, development_hint')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();
  return (data as ResearchTemplateHint | null) ?? null;
}
