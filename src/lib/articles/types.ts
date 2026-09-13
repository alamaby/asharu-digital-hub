import type { ArticleLangDraft } from '@/lib/llm/prompt';

export type ArticleLocale = 'id' | 'en';

export interface ArticleFaqItem {
  q: string;
  a: string;
}

export interface PublishedArticle {
  id: string;
  slug: string;
  locale: ArticleLocale;
  title: string;
  excerpt: string;
  body_md: string;
  faq: ArticleFaqItem[];
  cover_image_url: string | null;
  affiliate_url: string | null;
  product_id: string | null;
  published_at: string | null;
  updated_at: string;
}

export interface ArticleProduct {
  name: string;
  url: string;
}

/** Render konten artikel per-bahasa menjadi markdown untuk kolom body_md. */
export function renderArticleMarkdown(article: ArticleLangDraft): string {
  const parts: string[] = [article.excerpt.trim(), ''];
  for (const s of article.sections) {
    parts.push(`## ${s.h2.trim()}`, '', s.body.trim(), '');
  }
  return parts.join('\n').trim();
}
