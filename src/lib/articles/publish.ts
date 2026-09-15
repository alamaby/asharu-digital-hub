import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ARTICLE_MIN_WORDS,
  countArticleWords,
  slugifyTitle,
  type ArticleLangDraft,
  type ParsedArticleDraft
} from '@/lib/llm/prompt';
import { renderArticleMarkdown, type ArticleLocale } from './types';
import { resolveUniqueSlug, selectPublishLocales } from './publish-utils';

export interface ArticlePublishResult {
  success: boolean;
  published?: { locale: ArticleLocale; slug: string; id: string }[];
  error?: string;
}

/**
 * Core publish artikel: dipakai server action admin DAN automation cron
 * (service-role, tanpa sesi user). Tidak melakukan cek admin — caller yang
 * bertanggung jawab atas otorisasi. Idempoten per (draft_id, locale) via
 * upsert sehingga re-run aman.
 */
export async function publishArticleDraftCore(
  supabase: SupabaseClient,
  draftId: string,
  locales: ArticleLocale[]
): Promise<ArticlePublishResult> {
  if (!draftId) return { success: false, error: 'draftId required' };

  const { data: draft, error: draftError } = await supabase
    .from('content_drafts')
    .select('id, status, platform_slug, article_draft, research_topic_id, product_id, affiliate_injections')
    .eq('id', draftId)
    .maybeSingle();
  if (draftError || !draft) {
    return { success: false, error: draftError?.message ?? 'draft not found' };
  }
  const d = draft as {
    id: string;
    status: string;
    platform_slug: string | null;
    article_draft: ParsedArticleDraft | null;
    research_topic_id: string | null;
    product_id: string | null;
    affiliate_injections: Array<{ url: string }> | null;
  };
  if (d.platform_slug !== 'artikel' || !d.article_draft) {
    return { success: false, error: 'draft is not an article draft' };
  }

  // Bahasa sesi via topik riset (draf artikel selalu dari pipeline riset).
  let sessionLanguage: string | null = null;
  let sessionId: string | null = null;
  if (d.research_topic_id) {
    const { data: topicRow } = await supabase
      .from('content_research_topics')
      .select('id, session_id, content_research_sessions!inner(language)')
      .eq('id', d.research_topic_id)
      .maybeSingle();
    const t = topicRow as unknown as {
      session_id: string;
      content_research_sessions: { language: string | null };
    } | null;
    if (t) {
      sessionId = t.session_id;
      sessionLanguage = t.content_research_sessions?.language ?? null;
    }
  }

  const picked = selectPublishLocales(sessionLanguage, locales);
  if ('error' in picked) return { success: false, error: picked.error };

  // Validasi konten + thin-content gate per bahasa.
  const contents = new Map<ArticleLocale, ArticleLangDraft>();
  const thin: string[] = [];
  for (const locale of picked.locales) {
    const content = d.article_draft[locale];
    if (!content) {
      return { success: false, error: `konten artikel bahasa ${locale} kosong di draf` };
    }
    const words = countArticleWords(content);
    if (words < ARTICLE_MIN_WORDS) {
      thin.push(`${locale}:${words}`);
    }
    contents.set(locale, content);
  }
  if (thin.length > 0) {
    return {
      success: false,
      error: `thin content (<${ARTICLE_MIN_WORDS} kata): ${thin.join(', ')} — perbaiki draf sebelum publish`
    };
  }

  const affiliateUrl =
    (Array.isArray(d.affiliate_injections) ? d.affiliate_injections[0]?.url : null) ?? null;

  // Cover terpilih (post 0, status selected) → cover_image_url artikel.
  // Tanpa cover (mis. generate gagal) → null; automation menegakkan gate
  // require_cover sebelum memanggil core ini.
  const { data: coverRow } = await supabase
    .from('content_draft_images')
    .select('public_url')
    .eq('draft_id', draftId)
    .eq('post_index', 0)
    .eq('status', 'selected')
    .maybeSingle();
  const coverImageUrl = ((coverRow as { public_url: string | null } | null)?.public_url ?? null) || null;

  const published: { locale: ArticleLocale; slug: string; id: string }[] = [];
  for (const locale of picked.locales) {
    const content = contents.get(locale)!;
    const base = slugifyTitle(content.slug || content.title);

    // Slug unik per locale (abaikan baris milik draf ini sendiri agar
    // re-publish idempoten dan tidak menambah suffix).
    const { data: existing } = await supabase
      .from('articles')
      .select('id, slug, draft_id, published_at')
      .eq('locale', locale);
    const rows = ((existing ?? []) as { id: string; slug: string; draft_id: string | null; published_at: string | null }[]);
    const taken = new Set(rows.filter((r) => r.draft_id !== draftId).map((r) => r.slug));
    const slug = resolveUniqueSlug(base, taken);
    const own = rows.find((r) => r.draft_id === draftId);

    const now = new Date().toISOString();
    const { data: saved, error: saveError } = await supabase
      .from('articles')
      .upsert(
        {
          locale,
          slug,
          title: content.title,
          excerpt: content.excerpt,
          body_md: renderArticleMarkdown(content),
          faq: content.faq,
          cover_image_url: coverImageUrl,
          affiliate_url: affiliateUrl,
          status: 'published',
          draft_id: draftId,
          session_id: sessionId,
          topic_id: d.research_topic_id,
          product_id: d.product_id,
          published_at: own?.published_at ?? now,
          updated_at: now
        },
        { onConflict: 'draft_id,locale' }
      )
      .select('id')
      .single();
    if (saveError || !saved) {
      return { success: false, error: saveError?.message ?? 'article upsert failed' };
    }
    published.push({ locale, slug, id: (saved as { id: string }).id });
  }

  await supabase.from('content_drafts').update({ status: 'approved' }).eq('id', draftId);

  return { success: true, published };
}
